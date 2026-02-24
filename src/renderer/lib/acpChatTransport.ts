import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import type { AcpUpdateEvent } from '../types/electron-api';
import { acpStatusStore } from './acpStatusStore';
import { useToolOutputStore } from './toolOutputStore';
import { createLogger } from './logger';

const log = createLogger('AcpChatTransport');
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
        // Derive toolName from the first word of title (e.g. "Read", "Edit", "Run")
        // which maps well to TOOL_NAME_MAP. Fall back to kind only as last resort
        // since kind values like "execute"/"think" are categories, not tool names.
        const firstWord = update.title?.split(/\s/)[0] || '';
        const toolName = firstWord || update.kind || 'tool';
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

        // Stream incremental output for in-progress tools (e.g. long-running bash)
        if (update.status === 'in_progress') {
          const text = update.rawOutput ?? this.extractToolContent(update.content);
          if (text) {
            useToolOutputStore.getState().append(toolCallId, text);
          }
        }

        // When status is completed/failed, emit tool output
        if (update.status === 'completed' || update.status === 'failed') {
          useToolOutputStore.getState().markDone(toolCallId);
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
  size?: number; // total context window size (tokens)
  used?: number; // tokens used
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

  /** Cleanup function for the active onAcpUpdate IPC listener (stream or side-channel). */
  private activeCleanup: (() => void) | null = null;

  /** Cleanup for the persistent side-channel listener (runs when not streaming). */
  private sideChannelCleanup: (() => void) | null = null;

  /** Mutable side-channel callbacks — can be set/updated at any time. */
  private _sideChannel: AcpSideChannelEvents = {};

  /** Buffer for side-channel events that arrive before callbacks are wired. */
  private sideChannelBuffer: Array<{ updateType: string; update: any }> = [];

  get sideChannel(): AcpSideChannelEvents {
    return this._sideChannel;
  }

  set sideChannel(sc: AcpSideChannelEvents) {
    this._sideChannel = sc;
    // Replay any buffered events now that callbacks are wired
    if (this.sideChannelBuffer.length > 0) {
      const buffered = this.sideChannelBuffer;
      this.sideChannelBuffer = [];
      for (const { updateType, update } of buffered) {
        this.dispatchSideChannelEvent(sc, updateType, update);
      }
    }
  }

  /** When true, permission requests are auto-approved without UI confirmation. */
  autoApprove = false;

  constructor(options: AcpTransportOptions) {
    this.sessionKey = options.sessionKey;
    this.conversationId = options.conversationId;
    log.debug('Transport created', {
      sessionKey: options.sessionKey,
      conversationId: options.conversationId,
    });
    if (options.sideChannel) this._sideChannel = options.sideChannel;
    // Start listening for side-channel events immediately (commands, modes, etc.)
    this.startSideChannelListener();
  }

  /**
   * Dispatch a side-channel event to the appropriate callback.
   * Returns true if the event was handled, false if no callback was available.
   */
  private dispatchSideChannelEvent(
    sc: AcpSideChannelEvents,
    updateType: string,
    update: any
  ): boolean {
    if (updateType === 'available_commands_update' && sc.onCommandsUpdate) {
      sc.onCommandsUpdate(update.availableCommands || update.commands || []);
      return true;
    } else if (updateType === 'current_mode_update' && sc.onModeUpdate) {
      sc.onModeUpdate(update.modeId || update.currentModeId || '');
      return true;
    } else if (updateType === 'config_option_update' && sc.onConfigOptionUpdate) {
      sc.onConfigOptionUpdate(update);
      return true;
    } else if (updateType === 'session_info_update' && sc.onSessionInfoUpdate) {
      sc.onSessionInfoUpdate({ title: update.title, timestamp: update.timestamp });
      return true;
    }
    return false;
  }

  /**
   * Persistent listener for side-channel events that arrive outside of streaming
   * (e.g. available_commands_update sent right after session creation).
   */
  private startSideChannelListener(): void {
    this.stopSideChannelListener();
    this.sideChannelCleanup = api().onAcpUpdate(this.sessionKey, (event: AcpUpdateEvent) => {
      if (event.type !== 'session_update') return;
      const sc = this._sideChannel;
      const update = event.data?.update;
      const updateType = update?.sessionUpdate;
      if (!updateType) return;
      // If the callback isn't wired yet, buffer the event for replay
      if (!this.dispatchSideChannelEvent(sc, updateType, update)) {
        this.sideChannelBuffer.push({ updateType, update });
      }
    });
  }

  private stopSideChannelListener(): void {
    this.sideChannelCleanup?.();
    this.sideChannelCleanup = null;
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
    const messageText =
      lastUserMsg?.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('') || '';

    // Extract file parts (images and other files) from the user message
    const fileParts =
      lastUserMsg?.parts?.filter(
        (p): p is { type: 'file'; url: string; mediaType: string; filename?: string } =>
          p.type === 'file'
      ) || [];

    // Persist user message to DB
    if (lastUserMsg) {
      api()
        .saveMessage({
          id: lastUserMsg.id,
          conversationId,
          content: messageText,
          sender: 'user',
          parts: JSON.stringify(lastUserMsg.parts),
        })
        .catch(() => {
          /* non-fatal */
        });
    }

    log.debug('Sending message', {
      sessionKey,
      trigger: options.trigger,
      messageLength: messageText.length,
      hasFiles: fileParts.length > 0,
    });

    // Send prompt to ACP (include files if present)
    const result = await api().acpPrompt({
      sessionKey,
      message: messageText,
      files:
        fileParts.length > 0
          ? fileParts.map((f) => ({ url: f.url, mediaType: f.mediaType, filename: f.filename }))
          : undefined,
    });
    if (!result.success) {
      log.warn('Prompt send failed', { sessionKey, error: result.error });
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'error', errorText: result.error || 'Failed to send prompt' });
          controller.close();
        },
      });
    }

    // Return a stream that listens for ACP events
    // Capture instance members for use inside ReadableStream callbacks
    const getAutoApprove = () => this.autoApprove;
    const setActiveCleanup = (fn: (() => void) | null) => {
      this.activeCleanup = fn;
    };
    const startSideChannel = () => this.startSideChannelListener();
    const sideChannel = this._sideChannel;
    // Stop the side-channel listener — the stream listener handles everything
    this.stopSideChannelListener();
    // Clean up any previous stream listener
    this.activeCleanup?.();
    this.activeCleanup = null;

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const mapper = new ChunkMapper();
        // Track toolCallIds that already have a tool-input-available chunk
        // to avoid emitting duplicates when permission_request arrives
        const emittedToolCalls = new Set<string>();

        const rawCleanup = api().onAcpUpdate(sessionKey, (event: AcpUpdateEvent) => {
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
              } else if (
                updateType === 'available_commands_update' &&
                sideChannel.onCommandsUpdate
              ) {
                sideChannel.onCommandsUpdate(update.availableCommands || update.commands || []);
              } else if (updateType === 'current_mode_update' && sideChannel.onModeUpdate) {
                sideChannel.onModeUpdate(update.modeId || update.currentModeId || '');
              } else if (
                updateType === 'config_option_update' &&
                sideChannel.onConfigOptionUpdate
              ) {
                sideChannel.onConfigOptionUpdate(update);
              } else if (updateType === 'session_info_update' && sideChannel.onSessionInfoUpdate) {
                sideChannel.onSessionInfoUpdate({
                  title: update.title,
                  timestamp: update.timestamp,
                });
              }

              const chunks = mapper.map(event.data);
              for (const chunk of chunks) {
                if ((chunk as any).type === 'tool-input-available' && (chunk as any).toolCallId) {
                  emittedToolCalls.add((chunk as any).toolCallId);
                }
                controller.enqueue(chunk);
              }
              break;
            }

            case 'permission_request': {
              log.debug('Permission request', {
                sessionKey,
                toolCallId: event.toolCallId,
                autoApprove: getAutoApprove(),
              });
              if (getAutoApprove()) {
                // Auto-approve without showing UI
                api().acpApprove({ sessionKey, toolCallId: event.toolCallId, approved: true });
              } else {
                acpStatusStore.setStatus(sessionKey, 'streaming', true);

                // Emit a tool-input-available chunk so the ai-sdk has a tool
                // part with name + input before the approval state change.
                // Without this, the approval dialog shows a generic label.
                // Skip if a tool_call session_update already emitted one.
                const tc = event.data?.toolCall;
                if (tc && !emittedToolCalls.has(event.toolCallId)) {
                  const firstWord = tc.title?.split(/\s/)[0] || '';
                  const toolName = firstWord || tc.kind || 'tool';
                  emittedToolCalls.add(event.toolCallId);
                  controller.enqueue({
                    type: 'tool-input-available',
                    toolCallId: event.toolCallId,
                    toolName,
                    input: tc.rawInput ?? { title: tc.title },
                  });
                }

                controller.enqueue({
                  type: 'tool-approval-request',
                  approvalId: event.toolCallId,
                  toolCallId: event.toolCallId,
                });
              }
              break;
            }

            case 'prompt_complete': {
              log.debug('Prompt complete', { sessionKey });
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
              log.warn('Prompt error', { sessionKey, error: event.error });
              // Recoverable error — show error as text, close stream cleanly
              for (const chunk of mapper.endAll()) {
                controller.enqueue(chunk);
              }
              const errorId = nextPartId();
              controller.enqueue({ type: 'text-start', id: errorId });
              controller.enqueue({
                type: 'text-delta',
                id: errorId,
                delta: `\n\n**Error:** ${event.error}`,
              });
              controller.enqueue({ type: 'text-end', id: errorId });
              controller.enqueue({ type: 'finish', finishReason: 'error' });
              controller.close();
              cleanupUpdate();
              break;
            }

            case 'session_error': {
              log.warn('Session error', { sessionKey, error: event.error });
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

        // Wrap cleanup to also clear the tracked reference and restart side-channel
        const cleanupUpdate = () => {
          rawCleanup();
          setActiveCleanup(null);
          // Resume side-channel listener for events between prompts
          startSideChannel();
        };
        setActiveCleanup(cleanupUpdate);

        // Handle abort (user clicks stop)
        options.abortSignal?.addEventListener(
          'abort',
          () => {
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
          },
          { once: true }
        );
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    // ACP sessions don't support mid-stream reconnection.
    // Error recovery is handled at the session level via restartSession in useAcpSession.
    return null;
  }

  /**
   * Forward tool approval to ACP session.
   */
  approve(toolCallId: string, approved: boolean): void {
    acpStatusStore.setStatus(this.sessionKey, 'streaming', false);
    api().acpApprove({ sessionKey: this.sessionKey, toolCallId, approved });
  }

  /**
   * Clean up any in-flight IPC listeners without killing the session.
   */
  cleanupListeners(): void {
    this.activeCleanup?.();
    this.activeCleanup = null;
    this.stopSideChannelListener();
  }

  /**
   * Detach from the ACP session (cleanup listeners + IPC ownership).
   */
  destroy(): void {
    this.cleanupListeners();
    api().acpDetach({ sessionKey: this.sessionKey });
  }
}

// ---------------------------------------------------------------------------
// LazyAcpChatTransport — wraps AcpChatTransport for deferred session init
// ---------------------------------------------------------------------------

/**
 * A lazy wrapper around AcpChatTransport that allows the chat UI to render
 * immediately while the ACP session is still initializing.
 *
 * On first `sendMessages()` call, if the real transport isn't ready yet,
 * the message is queued and replayed once the session is established.
 */
export class LazyAcpChatTransport implements ChatTransport<UIMessage> {
  private inner: AcpChatTransport | null = null;
  private pendingSend: {
    options: Parameters<AcpChatTransport['sendMessages']>[0];
    resolve: (stream: ReadableStream<UIMessageChunk>) => void;
    reject: (err: Error) => void;
  } | null = null;
  private _error: Error | null = null;

  /** Mutable side-channel callbacks — forwarded to inner transport when ready. */
  private _sideChannel: AcpSideChannelEvents = {};
  private _autoApprove = false;

  get sideChannel(): AcpSideChannelEvents {
    return this.inner ? this.inner.sideChannel : this._sideChannel;
  }

  set sideChannel(sc: AcpSideChannelEvents) {
    this._sideChannel = sc;
    if (this.inner) this.inner.sideChannel = sc;
  }

  get autoApprove(): boolean {
    return this.inner ? this.inner.autoApprove : this._autoApprove;
  }

  set autoApprove(v: boolean) {
    this._autoApprove = v;
    if (this.inner) this.inner.autoApprove = v;
  }

  /** Whether the real transport is connected and ready. */
  get isReady(): boolean {
    return this.inner !== null;
  }

  /** Whether session creation failed. */
  get error(): Error | null {
    return this._error;
  }

  /**
   * Called by useAcpSession once the ACP session is established.
   * Transfers buffered side-channel/autoApprove settings and replays queued message.
   */
  setTransport(transport: AcpChatTransport): void {
    this.inner = transport;
    // Forward buffered settings
    transport.sideChannel = this._sideChannel;
    transport.autoApprove = this._autoApprove;

    // Replay queued send
    if (this.pendingSend) {
      log.debug('Lazy transport wired, replaying pending send');
      const { options, resolve, reject } = this.pendingSend;
      this.pendingSend = null;
      transport.sendMessages(options).then(resolve, reject);
    } else {
      log.debug('Lazy transport wired, no pending send');
    }
  }

  /**
   * Called by useAcpSession if session creation fails or the session is disposed.
   * Rejects any queued message.
   */
  setError(err: Error): void {
    log.warn('Lazy transport error set', { error: err.message });
    if (!this._error) this._error = err;
    if (this.pendingSend) {
      const { reject } = this.pendingSend;
      this.pendingSend = null;
      reject(err);
    }
  }

  async sendMessages(
    options: Parameters<AcpChatTransport['sendMessages']>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    if (this.inner) {
      return this.inner.sendMessages(options);
    }

    if (this._error) {
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'error', errorText: 'Session failed to initialize' });
          controller.close();
        },
      });
    }

    // Reject previous pending send if any (useChat should not call concurrently,
    // but guard against it to avoid orphaned promises)
    if (this.pendingSend) {
      this.pendingSend.reject(new Error('Superseded by newer message'));
      this.pendingSend = null;
    }

    // Queue the message until the real transport is ready
    return new Promise<ReadableStream<UIMessageChunk>>((resolve, reject) => {
      this.pendingSend = { options, resolve, reject };

      // Respect abort signal — if the user cancels before session is ready,
      // reject the queued send instead of replaying it later
      options.abortSignal?.addEventListener(
        'abort',
        () => {
          if (this.pendingSend?.options === options) {
            this.pendingSend = null;
            reject(new Error('Aborted'));
          }
        },
        { once: true }
      );
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    if (this.inner) return this.inner.reconnectToStream();
    return null;
  }

  approve(toolCallId: string, approved: boolean): void {
    this.inner?.approve(toolCallId, approved);
  }

  cleanupListeners(): void {
    this.inner?.cleanupListeners();
  }

  destroy(): void {
    this.inner?.destroy();
  }
}
