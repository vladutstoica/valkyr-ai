import { useCallback, useEffect } from 'react';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAcpSession } from '../hooks/useAcpSession';
import { AcpChatTransport } from '../lib/acpChatTransport';
import { Button } from './ui/button';
import { getToolDisplayLabel } from '../lib/toolRenderer';
import type { AcpSessionStatus } from '../types/electron-api';

// AI Elements
import { Message, MessageContent, MessageResponse } from './ai-elements/message';
import { Reasoning, ReasoningTrigger, ReasoningContent } from './ai-elements/reasoning';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from './ai-elements/tool';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from './ai-elements/conversation';
import { Loader } from './ai-elements/loader';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  type PromptInputMessage,
} from './ai-elements/prompt-input';
import { Confirmation, ConfirmationActions, ConfirmationAction, ConfirmationTitle, ConfirmationRequest } from './ai-elements/confirmation';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type AcpChatPaneProps = {
  conversationId: string;
  providerId: string;
  cwd: string;
  onStatusChange?: (status: AcpSessionStatus) => void;
  onAppendRef?: (fn: ((msg: { content: string }) => Promise<void>) | null) => void;
  onOpenAgentSettings?: () => void;
  className?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTextFromParts(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function MessageParts({ message, chatStatus }: { message: UIMessage; chatStatus: string }) {
  return (
    <>
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return <MessageResponse key={i}>{part.text}</MessageResponse>;

          case 'reasoning':
            return (
              <Reasoning
                key={i}
                isStreaming={chatStatus === 'streaming' && (part as any).state === 'streaming'}
              >
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );

          default: {
            // Tool parts (type starts with 'tool-')
            if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
              const toolPart = part as any;
              const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || 'unknown';
              const title = getToolDisplayLabel(toolName, toolPart.input || {});

              // Approval requested — show confirmation
              if (toolPart.state === 'approval-requested') {
                return (
                  <Confirmation
                    key={toolPart.toolCallId || i}
                    state="approval-requested"
                    approval={{ id: toolPart.toolCallId }}
                  >
                    <ConfirmationTitle>
                      Agent requests permission to run <strong>{title}</strong>
                    </ConfirmationTitle>
                    <ConfirmationRequest>
                      <ConfirmationActions>
                        <ConfirmationAction
                          variant="default"
                          data-tool-call-id={toolPart.toolCallId}
                          data-action="approve"
                        >
                          Allow
                        </ConfirmationAction>
                        <ConfirmationAction
                          variant="destructive"
                          data-tool-call-id={toolPart.toolCallId}
                          data-action="deny"
                        >
                          Deny
                        </ConfirmationAction>
                      </ConfirmationActions>
                    </ConfirmationRequest>
                  </Confirmation>
                );
              }

              return (
                <Tool key={toolPart.toolCallId || i}>
                  <ToolHeader
                    title={title}
                    type={toolPart.type}
                    state={toolPart.state}
                  />
                  <ToolContent>
                    <ToolInput input={toolPart.input || {}} />
                    <ToolOutput
                      output={toolPart.output}
                      errorText={toolPart.errorText}
                    />
                  </ToolContent>
                </Tool>
              );
            }
            return null;
          }
        }
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner component — mounts only when transport is ready
// ---------------------------------------------------------------------------

type AcpChatInnerProps = {
  conversationId: string;
  transport: AcpChatTransport;
  initialMessages: UIMessage[];
  onStatusChange?: (status: AcpSessionStatus) => void;
  onAppendRef?: (fn: ((msg: { content: string }) => Promise<void>) | null) => void;
  className: string;
};

function AcpChatInner({
  conversationId,
  transport,
  initialMessages,
  onStatusChange,
  onAppendRef,
  className,
}: AcpChatInnerProps) {
  const {
    messages,
    sendMessage,
    stop,
    status: chatStatus,
    error: chatError,
  } = useChat({
    id: conversationId,
    transport,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
    experimental_throttle: 50,
    onFinish: async ({ message }) => {
      const textContent = getTextFromParts(message.parts);
      window.electronAPI.saveMessage({
        id: message.id,
        conversationId,
        content: textContent,
        sender: 'assistant',
        parts: JSON.stringify(message.parts),
      }).catch(() => { /* non-fatal */ });
    },
  });

  const effectiveStatus: AcpSessionStatus = chatStatus === 'error'
    ? 'error'
    : chatStatus as AcpSessionStatus;

  // Expose append for external callers
  const appendFn = useCallback(async (msg: { content: string }) => {
    sendMessage({ text: msg.content });
  }, [sendMessage]);

  useEffect(() => {
    onAppendRef?.(appendFn);
    return () => onAppendRef?.(null);
  }, [appendFn, onAppendRef]);

  useEffect(() => {
    onStatusChange?.(effectiveStatus);
  }, [effectiveStatus, onStatusChange]);

  // Handle approval clicks (delegated from Confirmation buttons)
  const handleApprovalClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-tool-call-id]');
    if (!target) return;
    const toolCallId = target.getAttribute('data-tool-call-id');
    const action = target.getAttribute('data-action');
    if (toolCallId && action) {
      transport.approve(toolCallId, action === 'approve');
    }
  }, [transport]);

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    if (!message.text.trim()) return;
    sendMessage({ text: message.text });
  }, [sendMessage]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const isStreaming = chatStatus === 'streaming' || chatStatus === 'submitted';

  return (
    <div className={`flex h-full flex-col ${className}`} onClick={handleApprovalClick}>
      {/* Messages area */}
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && chatStatus === 'ready' && (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to begin working with this agent"
            />
          )}

          {messages.map((msg) => (
            <Message key={msg.id} from={msg.role}>
              <MessageContent>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{getTextFromParts(msg.parts)}</p>
                ) : (
                  <MessageParts message={msg} chatStatus={chatStatus} />
                )}
              </MessageContent>
            </Message>
          ))}

          {/* Streaming indicator */}
          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <Message from="assistant">
              <MessageContent>
                <Loader />
              </MessageContent>
            </Message>
          )}

          {/* Error display */}
          {chatStatus === 'error' && chatError && (
            <div className="mx-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {chatError.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <div className="border-t border-border/50 p-3">
        <PromptInput
          onSubmit={handleSubmit}
          accept="image/*"
          multiple
        >
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment key={attachment.id} data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea
            placeholder={
              chatStatus === 'error'
                ? 'Session error'
                : 'Type a message...'
            }
            disabled={chatStatus !== 'ready' && !isStreaming}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            {isStreaming ? (
              <PromptInputSubmit status="streaming" onClick={handleStop} />
            ) : (
              <PromptInputSubmit status={chatStatus} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component (outer wrapper)
// ---------------------------------------------------------------------------

export function AcpChatPane({
  conversationId,
  providerId,
  cwd,
  onStatusChange,
  onAppendRef,
  onOpenAgentSettings,
  className = '',
}: AcpChatPaneProps) {
  const {
    transport,
    sessionStatus,
    sessionError,
    initialMessages,
  } = useAcpSession({ conversationId, providerId, cwd });

  useEffect(() => {
    if (!transport) {
      onStatusChange?.('initializing');
    }
  }, [transport, onStatusChange]);

  useEffect(() => {
    if (!transport) {
      onAppendRef?.(null);
    }
  }, [transport, onAppendRef]);

  // Agent unavailable error
  if (sessionError && (sessionError.message === 'no_acp_support' || sessionError.message === 'acp_unavailable')) {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-3 p-6 text-center ${className}`}>
        <AlertCircle className="h-8 w-8 text-destructive" />
        <h3 className="text-sm font-semibold">Agent Unavailable</h3>
        <p className="max-w-md text-xs text-muted-foreground">
          {sessionError.message === 'no_acp_support'
            ? 'This agent is not installed. Install it from Settings \u2192 Agents \u2192 ACP Agents.'
            : 'Could not start the ACP agent. Make sure it is installed correctly.'}
        </p>
        {onOpenAgentSettings && (
          <Button variant="outline" size="sm" onClick={onOpenAgentSettings}>
            Open Agent Settings
          </Button>
        )}
      </div>
    );
  }

  // Loading state
  if (!transport) {
    return (
      <div className={`flex h-full items-center justify-center ${className}`}>
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AcpChatInner
      conversationId={conversationId}
      transport={transport}
      initialMessages={initialMessages}
      onStatusChange={onStatusChange}
      onAppendRef={onAppendRef}
      className={className}
    />
  );
}
