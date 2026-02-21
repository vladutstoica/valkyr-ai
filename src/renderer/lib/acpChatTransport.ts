import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import type { AcpUpdateEvent } from '../types/electron-api';

const api = () => window.electronAPI;

let partIdCounter = 0;
function nextPartId(): string {
  return `part-${Date.now()}-${partIdCounter++}`;
}

/**
 * Tracks active text/reasoning streams so multiple chunks
 * are concatenated into a single part instead of creating
 * separate parts per chunk.
 */
class ChunkMapper {
  private activeTextId: string | null = null;
  private activeReasoningId: string | null = null;

  /**
   * End any active text stream (e.g. when switching to a tool or reasoning).
   */
  private endText(): UIMessageChunk[] {
    if (this.activeTextId) {
      const id = this.activeTextId;
      this.activeTextId = null;
      return [{ type: 'text-end', id }];
    }
    return [];
  }

  /**
   * End any active reasoning stream.
   */
  private endReasoning(): UIMessageChunk[] {
    if (this.activeReasoningId) {
      const id = this.activeReasoningId;
      this.activeReasoningId = null;
      return [{ type: 'reasoning-end', id }];
    }
    return [];
  }

  /**
   * End all active streams (called on message end / finish).
   */
  endAll(): UIMessageChunk[] {
    return [...this.endText(), ...this.endReasoning()];
  }

  /**
   * Emit text-delta chunks, starting a new text stream if needed.
   */
  private pushText(text: string, chunks: UIMessageChunk[]): void {
    chunks.push(...this.endReasoning());
    if (!this.activeTextId) {
      this.activeTextId = nextPartId();
      chunks.push({ type: 'text-start', id: this.activeTextId });
    }
    chunks.push({ type: 'text-delta', id: this.activeTextId, delta: text });
  }

  /**
   * Emit reasoning-delta chunks, starting a new reasoning stream if needed.
   */
  private pushReasoning(text: string, chunks: UIMessageChunk[]): void {
    chunks.push(...this.endText());
    if (!this.activeReasoningId) {
      this.activeReasoningId = nextPartId();
      chunks.push({ type: 'reasoning-start', id: this.activeReasoningId });
    }
    chunks.push({ type: 'reasoning-delta', id: this.activeReasoningId, delta: text });
  }

  /**
   * Maps an ACP SessionNotification to AI SDK UIMessageChunk objects.
   *
   * ACP SessionUpdate types:
   *   - agent_message_chunk: text/image content from the agent
   *   - agent_thought_chunk: reasoning/thinking content
   *   - tool_call: tool invocation (separate from message chunks)
   *   - tool_call_update: tool progress/output updates
   *   - user_message_chunk, plan, usage_update, etc.
   */
  map(data: any): UIMessageChunk[] {
    const update = data?.update;
    const updateType = update?.sessionUpdate;
    const chunks: UIMessageChunk[] = [];

    switch (updateType) {
      // -- Agent text output --
      case 'agent_message_chunk': {
        const content = update?.content;
        if (content?.type === 'text' && content.text) {
          this.pushText(content.text, chunks);
        }
        break;
      }

      // -- Agent thinking/reasoning --
      case 'agent_thought_chunk': {
        const content = update?.content;
        if (content?.type === 'text' && content.text) {
          this.pushReasoning(content.text, chunks);
        }
        break;
      }

      // -- Tool invocation (created) --
      case 'tool_call': {
        chunks.push(...this.endAll());
        const toolCallId = update.toolCallId || `tool-${Date.now()}`;
        // Derive a tool name from the title (e.g. "Read file.ts" → "Read")
        const toolName = update.title?.split(/\s/)[0] || update.kind || 'tool';
        chunks.push({
          type: 'tool-input-available',
          toolCallId,
          toolName,
          input: update.rawInput ?? { title: update.title },
        });
        break;
      }

      // -- Tool progress/output update --
      case 'tool_call_update': {
        const toolCallId = update.toolCallId;
        if (!toolCallId) break;

        // When status is completed/failed, emit tool output
        if (update.status === 'completed' || update.status === 'failed') {
          const output = update.rawOutput ?? this.extractToolContent(update.content);
          chunks.push({
            type: 'tool-output-available',
            toolCallId,
            output: output ?? (update.status === 'failed' ? 'Tool execution failed' : ''),
          });
        }
        break;
      }

      // -- Usage update (tokens, cost) --
      case 'usage_update': {
        // Side-channel: not mapped to UIMessageChunk
        break;
      }

      // -- Plan update --
      case 'plan': {
        // Side-channel: not mapped to UIMessageChunk
        break;
      }

      // -- Available commands update --
      case 'available_commands_update': {
        // Side-channel: not mapped to UIMessageChunk
        break;
      }

      // -- Mode change notification --
      case 'current_mode_update': {
        // Side-channel: not mapped to UIMessageChunk
        break;
      }

      // -- Session info update --
      case 'session_info_update': {
        // Side-channel: not mapped to UIMessageChunk
        break;
      }

      default:
        break;
    }

    // Fallback for flat structure (older ACP versions or non-standard agents)
    if (chunks.length === 0 && !update) {
      if (data?.type === 'text' && data.text) {
        this.pushText(data.text, chunks);
      } else if (data?.type === 'thinking' && data.text) {
        this.pushReasoning(data.text, chunks);
      } else if (typeof data === 'string') {
        this.pushText(data, chunks);
      }
    }

    return chunks;
  }

  /**
   * Extract displayable text from ToolCallContent array.
   */
  private extractToolContent(content: any[] | undefined | null): string | undefined {
    if (!content || !Array.isArray(content)) return undefined;
    const parts: string[] = [];
    for (const item of content) {
      if (item.type === 'content' && item.content) {
        // ContentBlock: could be text, image, etc.
        if (item.content.type === 'text' && item.content.text) {
          parts.push(item.content.text);
        }
      } else if (item.type === 'diff' && item.diff) {
        parts.push(item.diff);
      } else if (item.type === 'terminal' && item.output) {
        parts.push(item.output);
      }
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
  }
}

// Side-channel event types (not part of UIMessageChunk stream)
export type AcpUsageData = {
  size?: number;     // total context window size (tokens)
  used?: number;     // tokens used
  cost?: { amount: number; currency: string };
};

export type AcpPlanEntry = {
  content: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'pending' | 'in_progress' | 'completed';
};

export type AcpCommand = {
  name: string;
  description?: string;
  inputSchema?: any;
};

export type AcpConfigOption = {
  optionId: string;
  name: string;
  description?: string;
  type: 'string' | 'boolean' | 'enum';
  value: string;
  options?: Array<{ value: string; label: string }>;
};

export type AcpSideChannelEvents = {
  onUsageUpdate?: (data: AcpUsageData) => void;
  onPlanUpdate?: (entries: AcpPlanEntry[]) => void;
  onCommandsUpdate?: (commands: AcpCommand[]) => void;
  onModeUpdate?: (modeId: string) => void;
  onConfigOptionUpdate?: (option: AcpConfigOption) => void;
  onSessionInfoUpdate?: (info: { title?: string; timestamp?: string }) => void;
};

export type AcpTransportOptions = {
  sessionKey: string;
  conversationId: string;
  sideChannel?: AcpSideChannelEvents;
};

/**
 * Custom ChatTransport that bridges Electron IPC / ACP sessions
 * to the AI SDK streaming protocol.
 */
export class AcpChatTransport implements ChatTransport<UIMessage> {
  private sessionKey: string;
  private conversationId: string;

  /** Mutable side-channel callbacks — can be set/updated at any time. */
  sideChannel: AcpSideChannelEvents = {};

  /** When true, permission requests are auto-approved without UI confirmation. */
  autoApprove = false;

  constructor(options: AcpTransportOptions) {
    this.sessionKey = options.sessionKey;
    this.conversationId = options.conversationId;
    if (options.sideChannel) this.sideChannel = options.sideChannel;
  }

  async sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const sessionKey = this.sessionKey;
    const conversationId = this.conversationId;

    // Extract latest user message text and files
    const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
    const messageText = lastUserMsg?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || '';

    // Extract file parts (images and other files) from the user message
    const fileParts = lastUserMsg?.parts
      ?.filter((p): p is { type: 'file'; url: string; mediaType: string; filename?: string } =>
        p.type === 'file'
      ) || [];

    // Persist user message to DB
    if (lastUserMsg) {
      api().saveMessage({
        id: lastUserMsg.id,
        conversationId,
        content: messageText,
        sender: 'user',
        parts: JSON.stringify(lastUserMsg.parts),
      }).catch(() => { /* non-fatal */ });
    }

    // Send prompt to ACP (include files if present)
    const result = await api().acpPrompt({
      sessionKey,
      message: messageText,
      files: fileParts.length > 0
        ? fileParts.map((f) => ({ url: f.url, mediaType: f.mediaType, filename: f.filename }))
        : undefined,
    });
    if (!result.success) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'error', errorText: result.error || 'Failed to send prompt' });
          controller.close();
        },
      });
    }

    // Return a stream that listens for ACP events
    const self = this;
    const sideChannel = this.sideChannel;
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const mapper = new ChunkMapper();

        const cleanupUpdate = api().onAcpUpdate(sessionKey, (event: AcpUpdateEvent) => {
          switch (event.type) {
            case 'session_update': {
              // Route side-channel events before mapping to chunks
              const update = event.data?.update;
              const updateType = update?.sessionUpdate;
              if (updateType === 'usage_update' && sideChannel.onUsageUpdate) {
                sideChannel.onUsageUpdate({
                  size: update.size,
                  used: update.used,
                  cost: update.cost,
                });
              } else if (updateType === 'plan' && sideChannel.onPlanUpdate) {
                sideChannel.onPlanUpdate(update.entries || update.plan || []);
              } else if (updateType === 'available_commands_update' && sideChannel.onCommandsUpdate) {
                sideChannel.onCommandsUpdate(update.commands || []);
              } else if (updateType === 'current_mode_update' && sideChannel.onModeUpdate) {
                sideChannel.onModeUpdate(update.modeId || update.currentModeId || '');
              } else if (updateType === 'config_option_update' && sideChannel.onConfigOptionUpdate) {
                sideChannel.onConfigOptionUpdate(update);
              } else if (updateType === 'session_info_update' && sideChannel.onSessionInfoUpdate) {
                sideChannel.onSessionInfoUpdate({
                  title: update.title,
                  timestamp: update.timestamp,
                });
              }

              const chunks = mapper.map(event.data);
              for (const chunk of chunks) {
                controller.enqueue(chunk);
              }
              break;
            }

            case 'permission_request': {
              if (self.autoApprove) {
                // Auto-approve without showing UI
                api().acpApprove({ sessionKey, toolCallId: event.toolCallId, approved: true });
              } else {
                controller.enqueue({
                  type: 'tool-approval-request',
                  approvalId: event.toolCallId,
                  toolCallId: event.toolCallId,
                });
              }
              break;
            }

            case 'prompt_complete': {
              // Close any active text/reasoning streams before finishing
              for (const chunk of mapper.endAll()) {
                controller.enqueue(chunk);
              }
              controller.enqueue({ type: 'finish', finishReason: 'stop' });
              controller.close();
              cleanupUpdate();
              break;
            }

            case 'prompt_error': {
              // Recoverable error — show error as text, close stream cleanly
              for (const chunk of mapper.endAll()) {
                controller.enqueue(chunk);
              }
              const errorId = nextPartId();
              controller.enqueue({ type: 'text-start', id: errorId });
              controller.enqueue({ type: 'text-delta', id: errorId, delta: `\n\n**Error:** ${event.error}` });
              controller.enqueue({ type: 'text-end', id: errorId });
              controller.enqueue({ type: 'finish', finishReason: 'error' });
              controller.close();
              cleanupUpdate();
              break;
            }

            case 'session_error': {
              for (const chunk of mapper.endAll()) {
                controller.enqueue(chunk);
              }
              controller.enqueue({ type: 'error', errorText: event.error });
              controller.close();
              cleanupUpdate();
              break;
            }
          }
        });

        // Handle abort (user clicks stop)
        options.abortSignal?.addEventListener('abort', () => {
          api().acpCancel({ sessionKey });
          cleanupUpdate();
          try {
            // Flush any open text/reasoning streams before finishing
            for (const chunk of mapper.endAll()) {
              controller.enqueue(chunk);
            }
            controller.enqueue({ type: 'finish', finishReason: 'stop' });
            controller.close();
          } catch {
            // Stream may already be closed
          }
        });
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    // ACP sessions don't support stream reconnection
    return null;
  }

  /**
   * Forward tool approval to ACP session.
   */
  approve(toolCallId: string, approved: boolean): void {
    api().acpApprove({ sessionKey: this.sessionKey, toolCallId, approved });
  }

  /**
   * Kill the ACP session.
   */
  destroy(): void {
    api().acpKill({ sessionKey: this.sessionKey });
  }
}
