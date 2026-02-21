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
   * Maps an ACP SessionNotification to AI SDK UIMessageChunk objects.
   */
  map(data: any): UIMessageChunk[] {
    const update = data?.update;
    const updateType = update?.sessionUpdate;
    const content = update?.content;
    const chunks: UIMessageChunk[] = [];

    if (updateType === 'agent_message_start') {
      chunks.push({ type: 'start' });
      chunks.push({ type: 'start-step' });
    } else if (updateType === 'agent_message_end') {
      chunks.push(...this.endAll());
      chunks.push({ type: 'finish-step' });
    } else if (updateType === 'agent_message_chunk' && content) {
      switch (content.type) {
        case 'text':
          if (content.text) {
            // End reasoning if active (switching from thinking to text)
            chunks.push(...this.endReasoning());
            // Start text stream if not already active
            if (!this.activeTextId) {
              this.activeTextId = nextPartId();
              chunks.push({ type: 'text-start', id: this.activeTextId });
            }
            chunks.push({ type: 'text-delta', id: this.activeTextId, delta: content.text });
          }
          break;

        case 'thinking':
          if (content.text) {
            // End text if active (switching from text to thinking)
            chunks.push(...this.endText());
            // Start reasoning stream if not already active
            if (!this.activeReasoningId) {
              this.activeReasoningId = nextPartId();
              chunks.push({ type: 'reasoning-start', id: this.activeReasoningId });
            }
            chunks.push({ type: 'reasoning-delta', id: this.activeReasoningId, delta: content.text });
          }
          break;

        case 'tool_use':
        case 'tool_call': {
          // End active text/reasoning before tool
          chunks.push(...this.endAll());
          const toolCallId = content.toolCallId || content.id || `tool-${Date.now()}`;
          const toolName = content.toolName || content.name || 'unknown';
          const input = content.args || content.input || {};
          chunks.push({
            type: 'tool-input-available',
            toolCallId,
            toolName,
            input,
          });
          break;
        }

        case 'tool_result': {
          const toolCallId = content.toolCallId || content.id || `tool-${Date.now()}`;
          const output = content.result || content.content;
          if (output !== undefined) {
            chunks.push({
              type: 'tool-output-available',
              toolCallId,
              output,
            });
          }
          break;
        }
      }
    }

    // Fallback for flat structure (older ACP versions)
    if (chunks.length === 0 && !update) {
      if (data?.type === 'text' && data.text) {
        chunks.push(...this.endReasoning());
        if (!this.activeTextId) {
          this.activeTextId = nextPartId();
          chunks.push({ type: 'text-start', id: this.activeTextId });
        }
        chunks.push({ type: 'text-delta', id: this.activeTextId, delta: data.text });
      } else if (data?.type === 'thinking' && data.text) {
        chunks.push(...this.endText());
        if (!this.activeReasoningId) {
          this.activeReasoningId = nextPartId();
          chunks.push({ type: 'reasoning-start', id: this.activeReasoningId });
        }
        chunks.push({ type: 'reasoning-delta', id: this.activeReasoningId, delta: data.text });
      } else if (typeof data === 'string') {
        chunks.push(...this.endReasoning());
        if (!this.activeTextId) {
          this.activeTextId = nextPartId();
          chunks.push({ type: 'text-start', id: this.activeTextId });
        }
        chunks.push({ type: 'text-delta', id: this.activeTextId, delta: data });
      }
    }

    return chunks;
  }
}

export type AcpTransportOptions = {
  sessionKey: string;
  conversationId: string;
};

/**
 * Custom ChatTransport that bridges Electron IPC / ACP sessions
 * to the AI SDK streaming protocol.
 */
export class AcpChatTransport implements ChatTransport<UIMessage> {
  private sessionKey: string;
  private conversationId: string;

  constructor(options: AcpTransportOptions) {
    this.sessionKey = options.sessionKey;
    this.conversationId = options.conversationId;
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

    // Extract latest user message text
    const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
    const messageText = lastUserMsg?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || '';

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

    // Send prompt to ACP
    const result = await api().acpPrompt({ sessionKey, message: messageText });
    if (!result.success) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'error', errorText: result.error || 'Failed to send prompt' });
          controller.close();
        },
      });
    }

    // Return a stream that listens for ACP events
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const mapper = new ChunkMapper();

        const cleanupUpdate = api().onAcpUpdate(sessionKey, (event: AcpUpdateEvent) => {
          switch (event.type) {
            case 'session_update': {
              const chunks = mapper.map(event.data);
              for (const chunk of chunks) {
                controller.enqueue(chunk);
              }
              break;
            }

            case 'permission_request': {
              controller.enqueue({
                type: 'tool-approval-request',
                approvalId: event.toolCallId,
                toolCallId: event.toolCallId,
              });
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
