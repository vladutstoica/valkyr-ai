import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Streamdown } from 'streamdown';
import { getContext, contextHealth } from 'tokenlens';
import {
  AlertCircle,
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BotIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  ListPlusIcon,
  Loader2,
  Loader2Icon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { useAcpSession } from '../hooks/useAcpSession';
import {
  LazyAcpChatTransport,
  type AcpUsageData,
  type AcpPlanEntry,
  type AcpCommand,
  type AcpConfigOption,
  type AcpToolMetadata,
  getAcpMeta,
} from '../lib/acpChatTransport';
import { Button } from './ui/button';
import { InputGroupButton } from './ui/input-group';
import {
  getToolDisplayLabel,
  getToolStepLabel,
  getToolIconComponent,
  normalizeToolName,
  normalizeFromKind,
} from '../lib/toolRenderer';
import type {
  AcpSessionStatus,
  AcpSessionModes,
  AcpSessionModels,
  AcpSessionModel,
} from '../types/electron-api';
import { acpStatusStore } from '../lib/acpStatusStore';
import { unifiedStatusStore } from '../lib/unifiedStatusStore';
import { agentConfig } from '../lib/agentConfig';
import type { Agent } from '../types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { SessionHistoryPopover } from './chat/SessionHistoryPopover';
import { AcpErrorCard } from './chat/AcpErrorCard';
import { ToolRunMiniIcons } from './chat/ToolRunMiniIcons';
import { ScrollBridge, UserMessageNavButton } from './chat/ScrollHelpers';
import { resolveModelId, estimateTokensFromMessages } from './chat/acpModelUtils';
import {
  getTextFromParts,
  extractMarkdownSources,
  findPlanFileInfo,
  summarizeToolRun,
} from './chat/acpChatUtils';
import { Command } from './ui/command';
import { ModelInfoCard } from './ModelInfoCard';
import { getSettings } from '../services/settingsService';
import {
  renderTextWithCitations,
  renderToolContent,
} from './chat/acpContentRenderers';
import { renderToolPart, StreamingToolGroup } from './chat/acpToolRenderers';

// AI Elements
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from './ai-elements/message';
import { Reasoning, ReasoningTrigger, ReasoningContent } from './ai-elements/reasoning';
import {
  mapToolStateToStepStatus,
} from './ai-elements/tool';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from './ai-elements/chain-of-thought';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  messagesToMarkdown,
  type ConversationMessage,
} from './ai-elements/conversation';
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanTrigger,
  PlanContent,
  PlanFooter,
} from './ai-elements/plan';
import { Sources, SourcesTrigger, SourcesContent, Source } from './ai-elements/sources';
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from './ai-elements/checkpoint';
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
} from './ai-elements/context';
import {
  PlanUsageHoverCard,
  PlanUsageContent,
  useClaudeUsageLimits,
} from './ai-elements/plan-usage';
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
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputSpeechButton,
  usePromptInputAttachments,
  type SpeechButtonState,
  type PromptInputMessage,
} from './ai-elements/prompt-input';
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationBody,
  ConfirmationAccepted,
  ConfirmationRejected,
} from './ai-elements/confirmation';
import { Shimmer } from './ai-elements/shimmer';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  getAttachmentLabel,
  getMediaCategory,
} from './ai-elements/attachments';
import { Suggestions, Suggestion } from './ai-elements/suggestion';
import { Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile } from './ai-elements/task';
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorName,
} from './ai-elements/model-selector';
import {
  Queue,
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueItemActions,
  QueueItemAction,
} from './ai-elements/queue';
import { useToolOutput } from '../lib/toolOutputStore';
import { getProvider, type ProviderId } from '@shared/providers/registry';

type AcpChatPaneProps = {
  taskId?: string;
  conversationId: string;
  providerId: string;
  cwd: string;
  projectPath?: string;
  /** Whether this pane's task is the active/visible one. Used to defer session init. */
  isActive?: boolean;
  conversationTitle?: string;
  onConversationTitleChange?: (title: string) => void;
  onStatusChange?: (status: AcpSessionStatus, sessionKey: string) => void;
  onAppendRef?: (fn: ((msg: { content: string }) => Promise<void>) | null) => void;
  onOpenAgentSettings?: () => void;
  onCreateNewChat?: () => void;
  onResumeSession?: (acpSessionId: string, title?: string) => void;
  onClearChat?: () => void;
  onDeleteChat?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  className?: string;
};

/**
 * Syncs PromptInput attachment state to an external ref.
 * Must be rendered inside <PromptInput> tree.
 */
function AttachmentSync({
  targetRef,
}: {
  targetRef: React.MutableRefObject<{ files: any[]; clear: () => void } | null>;
}) {
  const attachments = usePromptInputAttachments();
  useEffect(() => {
    targetRef.current = { files: attachments.files, clear: attachments.clear };
  }, [attachments.files, attachments.clear, targetRef]);
  return null;
}

function MessageParts({
  message,
  messages,
  chatStatus,
  sessionKey,
  currentModeId,
  pendingPlanApproval,
}: {
  message: UIMessage;
  messages: UIMessage[];
  chatStatus: string;
  sessionKey?: string | null;
  currentModeId?: string;
  pendingPlanApproval?: { toolCallId: string } | null;
}) {
  // Collect source parts for grouped rendering
  const sourceParts = message.parts.filter(
    (p) => p.type === 'source-url' || p.type === 'source-document'
  ) as Array<{ type: string; url?: string; title?: string; sourceId?: string }>;

  // Sources extracted from markdown text (e.g. trailing "Sources:" sections)
  const extractedSources: Array<{ title: string; url: string }> = [];

  // Group consecutive completed tool parts (3+) into collapsible groups
  const elements: React.ReactNode[] = [];
  let toolRun: Array<{ part: any; index: number }> = [];

  const flushToolRun = () => {
    if (toolRun.length === 0) return;
    const allCompleted = toolRun.every(
      (t) =>
        t.part.state === 'output-available' ||
        t.part.state === 'output-error' ||
        t.part.state === 'output-denied'
    );
    if (allCompleted && toolRun.length >= 3) {
      elements.push(
        <ChainOfThought key={`tg-${toolRun[0].index}`}>
          <ChainOfThoughtHeader>
            <span className="flex items-center gap-2">
              <span>{toolRun.length} steps</span>
              <ToolRunMiniIcons toolRun={toolRun} />
            </span>
            <span className="text-muted-foreground/60 text-[10px]">
              {summarizeToolRun(toolRun)}
            </span>
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {toolRun.map((t) => {
              const toolName = t.part.toolName || t.part.type?.replace(/^tool-/, '') || '';
              const tAcpMeta = getAcpMeta(t.part);
              const label = getToolStepLabel(
                toolName,
                t.part.input || {},
                t.part.output,
                t.part.title
              );
              const Icon = getToolIconComponent(toolName, tAcpMeta?.kind);
              const status = mapToolStateToStepStatus(t.part.state);
              return (
                <ChainOfThoughtStep
                  key={t.part.toolCallId || t.index}
                  icon={Icon}
                  label={label}
                  status={status}
                >
                  {renderToolContent(t.part)}
                </ChainOfThoughtStep>
              );
            })}
          </ChainOfThoughtContent>
        </ChainOfThought>
      );
    } else if (!allCompleted && toolRun.length >= 3) {
      elements.push(
        <StreamingToolGroup
          key={`stg-${toolRun[0].index}`}
          toolRun={[...toolRun]}
          sessionKey={sessionKey}
        />
      );
    } else {
      for (const t of toolRun) {
        elements.push(renderToolPart(t.part, t.index, sessionKey));
      }
    }
    toolRun = [];
  };

  message.parts.forEach((part, i) => {
    // Skip source parts — rendered grouped below
    if (part.type === 'source-url' || part.type === 'source-document') return;

    const isToolPart = typeof part.type === 'string' && part.type.startsWith('tool-');

    if (isToolPart) {
      const toolPart = part as any;
      const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';

      // Render TodoWrite / TaskCreate calls using the Task component
      if ((toolName === 'TodoWrite' || toolName === 'TaskCreate') && toolPart.input) {
        flushToolRun();
        const input = toolPart.input;
        const tasks: Array<{ subject: string; status?: string; description?: string }> =
          input.tasks || input.items || (input.subject ? [input] : []);
        if (tasks.length > 0) {
          elements.push(
            <Task key={toolPart.toolCallId || i} defaultOpen>
              <TaskTrigger title={input.title || `Tasks (${tasks.length})`} />
              <TaskContent>
                {tasks.map((t, ti) => (
                  <TaskItem
                    key={ti}
                    className={
                      t.status === 'completed' ? 'text-muted-foreground/60 line-through' : ''
                    }
                  >
                    {t.subject || t.description}
                    {input.file_path && <TaskItemFile>{input.file_path}</TaskItemFile>}
                  </TaskItem>
                ))}
              </TaskContent>
            </Task>
          );
        } else {
          elements.push(renderToolPart(toolPart, i, sessionKey));
        }
      } else if (toolPart.state === 'approval-requested' || toolPart.state === 'output-denied') {
        // Approval lifecycle tools break out of grouping
        flushToolRun();
        const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
        const approvalAcpMeta = getAcpMeta(toolPart);
        const title = getToolDisplayLabel(toolName, toolPart.input || {}, toolPart.title);
        const approval =
          toolPart.state === 'output-denied'
            ? { id: toolPart.toolCallId, approved: false as const }
            : { id: toolPart.toolCallId };

        const isModeSwitch =
          toolName === 'switch_mode' ||
          toolName === 'ExitPlanMode' ||
          toolName === 'EnterPlanMode' ||
          approvalAcpMeta?.kind === 'switch_mode';
        const targetMode = (toolPart.input?.mode_slug || toolPart.input?.mode || '') as string;

        // For mode switches, find the plan content to show inline
        let planPreviewContent: string | null = null;
        if (isModeSwitch) {
          // 1. Prefer input.plan (ACP SDK ≥ 0.1.54)
          if (
            typeof toolPart.input?.plan === 'string' &&
            (toolPart.input.plan as string).length > 0
          ) {
            planPreviewContent = toolPart.input.plan as string;
          }
          // 2. Scan all messages for plan file content (inline data or path)
          if (!planPreviewContent) {
            const planInfo = findPlanFileInfo(messages);
            planPreviewContent = planInfo.content ?? null;
          }
          // 3. Fallback: scan preceding parts in current message for large text
          if (!planPreviewContent) {
            for (let j = i - 1; j >= 0; j--) {
              const prev = message.parts[j] as any;
              if (prev?.type === 'text' && prev.text && prev.text.length > 100) {
                planPreviewContent = prev.text;
                break;
              }
            }
          }
          // 4. Last resort: check the tool's own output
          if (!planPreviewContent && toolPart.output && String(toolPart.output).length > 50) {
            planPreviewContent = String(toolPart.output);
          }
        }

        // Skip inline confirmation for mode switches — the Plan card handles approval
        if (isModeSwitch && pendingPlanApproval?.toolCallId === toolPart.toolCallId) {
          return;
        }

        // Build confirmation title based on tool type
        let confirmTitle: React.ReactNode;
        if (isModeSwitch) {
          const fromLabel = currentModeId || '';
          const toLabel = targetMode || 'code';
          if (fromLabel && fromLabel !== toLabel) {
            confirmTitle = (
              <>
                Switch from <strong>{fromLabel}</strong> to <strong>{toLabel}</strong> mode?
              </>
            );
          } else {
            confirmTitle = (
              <>
                Switch to <strong>{toLabel}</strong> mode?
              </>
            );
          }
        } else if (title) {
          confirmTitle = (
            <>
              Approve <strong>{title}</strong>?
            </>
          );
        } else {
          // No meaningful label available — show the raw tool name so the user
          // can at least see the tool type rather than a blank prompt
          confirmTitle = (
            <>
              Approve <strong>{toolName || 'tool call'}</strong>?
            </>
          );
        }

        // Build a detail preview for tool inputs so the user knows what they're approving.
        // Try smart rendering first (same as post-approval), then fall back to text preview.
        const toolInput = toolPart.input || {};
        const normalized = approvalAcpMeta?.kind
          ? normalizeFromKind(approvalAcpMeta.kind)
          : normalizeToolName(toolName);
        let inputPreviewJsx: React.ReactNode | null = null;
        let inputPreview: string | null = null;
        if (!isModeSwitch) {
          // Try smart rendering — shows code blocks, diffs, terminal commands, etc.
          inputPreviewJsx = renderToolContent(toolPart);

          // If no smart content, build a text preview
          if (!inputPreviewJsx) {
            if (normalized === 'bash') {
              const cmd = (toolInput.command || toolInput.cmd || '') as string;
              if (cmd) inputPreview = `$ ${cmd}`;
            } else if (normalized === 'edit_file') {
              const fp = (toolInput.file_path || toolInput.path || toolInput.file || '') as string;
              const oldStr = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
              const newStr = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
              if (fp) inputPreview = fp;
              if (oldStr || newStr) {
                inputPreview =
                  (inputPreview ? inputPreview + '\n\n' : '') +
                  (oldStr ? `- ${oldStr.slice(0, 200)}` : '') +
                  (oldStr && newStr ? '\n' : '') +
                  (newStr ? `+ ${newStr.slice(0, 200)}` : '');
              }
            } else if (normalized === 'write_file') {
              const fp = (toolInput.file_path || toolInput.path || toolInput.file || '') as string;
              const content = typeof toolInput.content === 'string' ? toolInput.content : '';
              inputPreview = fp || null;
              if (content) {
                inputPreview = (inputPreview ? inputPreview + '\n\n' : '') + content.slice(0, 300);
              }
            } else if (normalized === 'read_file') {
              const fp = (toolInput.file_path || toolInput.path || toolInput.file || '') as string;
              if (fp) inputPreview = fp;
            }

            // If we still have no preview, extract from ACP title or show raw input as JSON
            if (!inputPreview) {
              // Use the AI SDK title field (from ACP ToolCall.title) or fallback to input.title
              const acpTitleStr =
                toolPart.title || (typeof toolInput.title === 'string' ? toolInput.title : '');
              if (acpTitleStr) {
                // For bash, strip "Run " prefix to show just the command
                if (normalized === 'bash' && acpTitleStr.startsWith('Run ')) {
                  inputPreview = `$ ${acpTitleStr.slice(4)}`;
                } else {
                  inputPreview = acpTitleStr;
                }
              }
            }

            // Last resort: show raw input as JSON
            if (!inputPreview && toolInput && Object.keys(toolInput).length > 0) {
              const displayInput = Object.fromEntries(
                Object.entries(toolInput).filter(([k]) => k !== 'title')
              );
              if (Object.keys(displayInput).length > 0) {
                inputPreview = JSON.stringify(displayInput, null, 2);
              }
            }
          }
        }

        // Use title for after-the-fact labels, fall back to toolName
        const displayTitle = title || toolName || 'tool call';

        const hasPreview = planPreviewContent || inputPreviewJsx || inputPreview;

        elements.push(
          <Confirmation key={toolPart.toolCallId || i} state={toolPart.state} approval={approval}>
            <ConfirmationTitle>{confirmTitle}</ConfirmationTitle>
            {hasPreview && (
              <ConfirmationBody className="border-border/50 bg-muted/30 max-h-72 overflow-y-auto rounded border p-3">
                {planPreviewContent ? (
                  <pre className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {planPreviewContent}
                  </pre>
                ) : inputPreviewJsx ? (
                  inputPreviewJsx
                ) : (
                  <pre className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {inputPreview}
                  </pre>
                )}
              </ConfirmationBody>
            )}
            <ConfirmationRequest>
              <ConfirmationActions className="w-full justify-between">
                <span className="text-muted-foreground/60 text-xs">
                  <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Enter
                  </kbd>{' '}
                  to approve
                  {' \u00b7 '}
                  <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Esc
                  </kbd>{' '}
                  to reject
                </span>
                <span className="flex items-center gap-2">
                  <ConfirmationAction
                    variant="outline"
                    data-tool-call-id={toolPart.toolCallId}
                    data-action="deny"
                  >
                    Reject
                  </ConfirmationAction>
                  <ConfirmationAction
                    variant="default"
                    data-tool-call-id={toolPart.toolCallId}
                    data-action="approve"
                  >
                    Approve
                  </ConfirmationAction>
                </span>
              </ConfirmationActions>
            </ConfirmationRequest>
            <ConfirmationAccepted>
              Approved <strong>{displayTitle}</strong>
            </ConfirmationAccepted>
            <ConfirmationRejected>
              Rejected <strong>{displayTitle}</strong>
            </ConfirmationRejected>
          </Confirmation>
        );
      } else {
        toolRun.push({ part: toolPart, index: i });
      }
    } else {
      flushToolRun();
      switch (part.type) {
        case 'text': {
          // Detect ACP error markers and render as styled card
          const acpErrorMarker = '<!---acp-error--->';
          if (part.text.includes(acpErrorMarker)) {
            const errorRaw = part.text.split(acpErrorMarker).pop()?.trim() || 'Unknown error';
            elements.push(<AcpErrorCard key={i} error={errorRaw} />);
            break;
          }
          // Try to extract a trailing "Sources:" section from the last text part
          let textContent = part.text;
          const extracted =
            message.role === 'assistant' ? extractMarkdownSources(textContent) : null;
          if (extracted) {
            textContent = extracted.text;
            extractedSources.push(...extracted.sources);
          }

          const citationElements =
            sourceParts.length > 0 ? renderTextWithCitations(textContent, sourceParts) : null;
          if (citationElements) {
            // Render with inline citation pills embedded between markdown segments
            elements.push(
              <div key={i} className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {citationElements.map((segment, si) =>
                  typeof segment === 'string' ? (
                    <MessageResponse key={si}>{segment}</MessageResponse>
                  ) : (
                    segment
                  )
                )}
              </div>
            );
          } else {
            elements.push(<MessageResponse key={i}>{textContent}</MessageResponse>);
          }
          break;
        }
        case 'reasoning':
          elements.push(
            <Reasoning
              key={i}
              isStreaming={chatStatus === 'streaming' && (part as any).state === 'streaming'}
            >
              <ReasoningTrigger />
              <ReasoningContent>{part.text}</ReasoningContent>
            </Reasoning>
          );
          break;
        default: {
          // Render unknown part types so nothing is silently dropped
          const unknownPart = part as any;
          const content = unknownPart.text || unknownPart.content || unknownPart.value;
          if (content && typeof content === 'string') {
            elements.push(
              <div
                key={i}
                className="text-muted-foreground rounded border px-3 py-2 font-mono text-xs whitespace-pre-wrap"
              >
                <span className="text-muted-foreground/50 text-[10px] uppercase">{part.type}</span>
                <div className="mt-1">
                  {content.slice(0, 1000)}
                  {content.length > 1000 ? '...' : ''}
                </div>
              </div>
            );
          } else if (unknownPart.type) {
            // Even if there's no text content, show the part type so users know something happened
            elements.push(
              <div key={i} className="text-muted-foreground/60 px-1 text-[10px]">
                [{unknownPart.type}]
              </div>
            );
          }
          break;
        }
      }
    }
  });
  flushToolRun();

  // Merge typed source parts with sources extracted from markdown
  const allSources = [
    ...sourceParts.map((src) => ({
      title: (src as any).title || (src as any).url || '',
      url: (src as any).url || '',
    })),
    ...extractedSources,
  ];

  return (
    <>
      {elements}

      {/* Sources (grouped) */}
      {allSources.length > 0 && (
        <Sources defaultOpen>
          <SourcesTrigger count={allSources.length} />
          <SourcesContent>
            {allSources.map((src, i) => (
              <Source key={i} href={src.url} title={src.title || src.url || `Source ${i + 1}`} />
            ))}
          </SourcesContent>
        </Sources>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner component — mounts when lazy transport is available
// ---------------------------------------------------------------------------

type AcpChatInnerProps = {
  conversationId: string;
  providerId: string;
  cwd: string;
  projectPath?: string;
  transport: LazyAcpChatTransport;
  initialMessages: UIMessage[];
  sessionStatus: AcpSessionStatus;
  sessionKey: string | null;
  acpSessionId: string | null;
  resumed: boolean | null;
  modes: AcpSessionModes;
  models: AcpSessionModels;
  conversationTitle?: string;
  onConversationTitleChange?: (title: string) => void;
  onStatusChange?: (status: AcpSessionStatus, sessionKey: string) => void;
  onAppendRef?: (fn: ((msg: { content: string }) => Promise<void>) | null) => void;
  onCreateNewChat?: () => void;
  onResumeSession?: (acpSessionId: string, title?: string) => void;
  onClearChat?: () => void;
  onDeleteChat?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  className: string;
};

function AcpChatInner({
  conversationId,
  providerId,
  cwd,
  projectPath,
  transport,
  initialMessages,
  sessionStatus: parentSessionStatus,
  sessionKey,
  acpSessionId,
  resumed,
  modes: initialModes,
  models: initialModels,
  onStatusChange,
  onAppendRef,
  onCreateNewChat,
  conversationTitle,
  onConversationTitleChange,
  onResumeSession,
  onClearChat,
  onDeleteChat,
  onMoveLeft,
  onMoveRight,
  canMoveLeft = true,
  canMoveRight = true,
  className,
}: AcpChatInnerProps) {
  const [currentModeId, setCurrentModeId] = useState(initialModes?.currentModeId ?? '');
  const [currentModelId, setCurrentModelId] = useState(initialModels?.currentModelId ?? '');
  const [hoveredModel, setHoveredModel] = useState<AcpSessionModel | null>(null);

  // Sync mode/model when initial data arrives (useState only captures the first value)
  useEffect(() => {
    if (initialModes?.currentModeId) setCurrentModeId(initialModes.currentModeId);
  }, [initialModes?.currentModeId]);
  useEffect(() => {
    if (initialModels?.currentModelId) setCurrentModelId(initialModels.currentModelId);
  }, [initialModels?.currentModelId]);

  // Resolve ACP alias (e.g. "default") to a real model ID for tokenlens
  const resolvedModelId = useMemo(() => {
    if (!currentModelId) return undefined;
    const currentModel = initialModels?.availableModels.find((m) => m.id === currentModelId);
    return resolveModelId(currentModelId, currentModel?.description);
  }, [currentModelId, initialModels?.availableModels]);

  const historyIndexRef = useRef(-1);

  // Message queue for rapid sends
  const messageQueueRef = useRef<Array<{ text: string; files?: any[] }>>([]);
  const [queuedMessages, setQueuedMessages] = useState<Array<{ text: string; files?: any[] }>>([]);

  // Track whether textarea has content (for interrupt vs queue buttons during streaming)
  const [inputHasText, setInputHasText] = useState(false);
  const interruptPayloadRef = useRef<{ text: string; files?: any[] } | null>(null);

  // External ref to PromptInput attachments — synced by AttachmentSync below
  const promptAttachmentsRef = useRef<{ files: any[]; clear: () => void } | null>(null);
  const scrollToBottomRef = useRef<(() => void) | null>(null);

  // User message navigation — jump between your own messages
  const userMessageNavRef = useRef<number>(-1); // -1 = not navigating, 0 = latest user msg, 1 = second latest, etc.

  const navigateUserMessages = useCallback((direction: 'prev' | 'next') => {
    const userMsgEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-message-role="user"]')
    );
    if (userMsgEls.length === 0) return;

    // Work in reverse order: last user message = index 0
    const reversed = [...userMsgEls].reverse();
    let idx = userMessageNavRef.current;

    if (direction === 'prev') {
      // Go to older (higher index)
      idx = Math.min(idx + 1, reversed.length - 1);
    } else {
      // Go to newer (lower index)
      idx = idx - 1;
      if (idx < 0) {
        // Back to bottom
        userMessageNavRef.current = -1;
        scrollToBottomRef.current?.();
        return;
      }
    }

    userMessageNavRef.current = idx;
    reversed[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Reset navigation index when user scrolls to bottom or sends a message
  const resetUserNav = useCallback(() => {
    userMessageNavRef.current = -1;
  }, []);

  // Side-channel state
  const [usage, setUsage] = useState<AcpUsageData | null>(null);
  const [planEntries, setPlanEntries] = useState<AcpPlanEntry[]>([]);
  const [planDismissed, setPlanDismissed] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  // When ExitPlanMode needs approval, store the toolCallId + plan content here
  const [pendingPlanApproval, setPendingPlanApproval] = useState<{
    toolCallId: string;
    content: string | null;
    fromMode?: string;
    toMode?: string;
  } | null>(null);
  // DEBUG: expose plan state for dev testing — remove before release
  useEffect(() => {
    const arr = ((window as any).__planDebug = (window as any).__planDebug || []);
    const entry = { setPlanEntries, setPendingPlanApproval, setPlanDismissed, id: conversationId };
    arr.push(entry);
    return () => {
      const idx = arr.indexOf(entry);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }, [conversationId]);
  // Auto-show when a new plan arrives (entries change from empty to non-empty)
  const prevPlanLengthRef = useRef(0);
  useEffect(() => {
    if (planEntries.length > 0 && prevPlanLengthRef.current === 0) {
      setPlanDismissed(false);
      setPlanOpen(true);
    }
    prevPlanLengthRef.current = planEntries.length;
  }, [planEntries]);
  // Auto-open plan card when pending approval appears
  const prevPendingRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingPlanApproval?.toolCallId ?? null;
    if (id && id !== prevPendingRef.current) {
      setPlanOpen(true);
      setPlanDismissed(false);
    }
    prevPendingRef.current = id;
  }, [pendingPlanApproval]);
  const [availableCommands, setAvailableCommands] = useState<AcpCommand[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [configOptions, setConfigOptions] = useState<Map<string, AcpConfigOption>>(new Map());
  const [compactBoundaryMsgId, setCompactBoundaryMsgId] = useState<string | null>(null);

  // Editable conversation title state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // Track whether we already auto-generated a title for this conversation
  const titleAutoSetRef = useRef(false);

  const agent = agentConfig[providerId as Agent];

  /** Check if a title is still the generic "AgentName" or "AgentName N" pattern */
  const isGenericTitle = useCallback(
    (title?: string) => {
      if (!title) return true;
      const agentName = agent?.name || providerId;
      // Matches "Claude Code", "Claude Code 2", "Resumed: Claude Code", etc.
      return (
        /^(Resumed:\s*)?/.test(title) &&
        title.replace(/^Resumed:\s*/, '').replace(/\s+\d+$/, '') === agentName
      );
    },
    [agent?.name, providerId]
  );

  /** Persist a new title to DB and notify parent */
  const updateTitle = useCallback(
    (newTitle: string) => {
      if (!newTitle.trim()) return;
      window.electronAPI
        .updateConversationTitle({ conversationId, title: newTitle.trim() })
        .catch(() => {});
      onConversationTitleChange?.(newTitle.trim());
    },
    [conversationId, onConversationTitleChange]
  );
  const claudeUsageLimits = useClaudeUsageLimits(providerId);
  const {
    messages,
    sendMessage,
    setMessages,
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
      window.electronAPI
        .saveMessage({
          id: message.id,
          conversationId,
          content: textContent,
          sender: 'assistant',
          parts: JSON.stringify(message.parts),
        })
        .catch(() => {
          /* non-fatal */
        });

      // Auto-generate conversation title from first user message if still generic
      if (!titleAutoSetRef.current && isGenericTitle(conversationTitle)) {
        titleAutoSetRef.current = true;
        // Find the first user message text
        const allMsgs = [...(initialMessages.length > 0 ? initialMessages : []), message];
        const firstUserMsg = allMsgs.find((m) => m.role === 'user');
        if (firstUserMsg) {
          const userText = getTextFromParts(firstUserMsg.parts).trim();
          if (userText) {
            // Truncate at word boundary around 60 chars
            const maxLen = 60;
            const truncated =
              userText.length <= maxLen
                ? userText
                : userText.substring(0, userText.lastIndexOf(' ', maxLen) || maxLen) + '...';
            updateTitle(truncated);
          }
        }
      }
    },
  });

  // Wire side-channel callbacks on transport
  useEffect(() => {
    // eslint-disable-next-line -- false positive: ESLint internal error on setter assignment
    transport.sideChannel = {
      onUsageUpdate: (data) => setUsage(data),
      onPlanUpdate: (entries) => setPlanEntries(entries),
      onCommandsUpdate: (cmds) => setAvailableCommands(cmds),
      onModeUpdate: (modeId) => setCurrentModeId(modeId),
      onConfigOptionUpdate: (option) => {
        setConfigOptions((prev) => {
          const next = new Map(prev);
          next.set(option.optionId, option);
          return next;
        });
      },
      onSessionInfoUpdate: (info) => {
        if (info.title) {
          setSessionTitle(info.title);
          // Persist agent-provided title to conversation DB
          updateTitle(info.title);
          titleAutoSetRef.current = true;
        }
      },
      onCompactComplete: () => {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg) setCompactBoundaryMsgId(lastMsg.id);
          return prev;
        });
      },
    };
    return () => {
      transport.sideChannel = {};
    };
  }, [transport]);

  // Incrementally persist the latest assistant message during streaming.
  // This prevents data loss if the component unmounts before onFinish fires
  // (e.g. navigating to Settings while an agent is streaming).
  const streamSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Only save while actively streaming
    if (chatStatus !== 'streaming' && chatStatus !== 'submitted') return;

    // Find the last assistant message
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;

    // Debounce: save at most every 3 seconds
    if (streamSaveTimerRef.current) clearTimeout(streamSaveTimerRef.current);
    streamSaveTimerRef.current = setTimeout(() => {
      streamSaveTimerRef.current = null;
      const textContent = getTextFromParts(lastAssistant.parts);
      window.electronAPI
        .saveMessage({
          id: lastAssistant.id,
          conversationId,
          content: textContent,
          sender: 'assistant',
          parts: JSON.stringify(lastAssistant.parts),
        })
        .catch(() => {
          /* non-fatal */
        });
    }, 3000);

    return () => {
      if (streamSaveTimerRef.current) {
        clearTimeout(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
      }
    };
  }, [messages, chatStatus, conversationId]);

  // Arrow-up message recall — derived from messages, always in sync
  const messageHistory = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'user')
        .map((m) => getTextFromParts(m.parts))
        .filter(Boolean),
    [messages]
  );

  // Sync restored messages into useChat when they arrive after initial mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (initialMessages.length > 0 && !restoredRef.current) {
      restoredRef.current = true;
      // Only set if useChat currently has no messages (i.e. it missed the initial prop)
      if (messages.length === 0) {
        setMessages(initialMessages);
      }
    }
  }, [initialMessages, messages.length, setMessages]);

  // ── Track pending ExitPlanMode approvals → surface in Plan component ──
  useEffect(() => {
    // Scan the last assistant message for an ExitPlanMode tool awaiting approval
    for (let mi = messages.length - 1; mi >= 0; mi--) {
      const msg = messages[mi];
      if (msg.role !== 'assistant') continue;
      for (let pi = (msg.parts?.length ?? 0) - 1; pi >= 0; pi--) {
        const part = msg.parts[pi] as any;
        // AI SDK uses both 'tool-invocation' and 'tool-{name}' type formats
        if (!part?.type?.startsWith('tool-') && part?.type !== 'tool-invocation') continue;
        const partAcpMeta = getAcpMeta(part);
        const name = part.toolName || '';
        const isModeSwitch =
          name === 'ExitPlanMode' || name === 'switch_mode' || partAcpMeta?.kind === 'switch_mode';
        if (!isModeSwitch) continue;
        if (part.state === 'approval-requested') {
          // Extract mode switch info
          const targetMode = (part.input?.mode_slug || part.input?.mode || 'code') as string;

          // Extract plan content with layered fallbacks
          let content: string | null = null;

          // 1. Prefer input.plan (ACP SDK ≥ 0.1.54)
          if (typeof part.input?.plan === 'string' && part.input.plan.length > 0) {
            content = part.input.plan;
          }

          // 2. Scan all messages for plan file content or path
          if (!content) {
            const planInfo = findPlanFileInfo(messages);
            if (planInfo.content) {
              content = planInfo.content;
            } else if (planInfo.path) {
              // Read the plan file asynchronously via IPC
              const dir = planInfo.path.substring(0, planInfo.path.lastIndexOf('/'));
              const file = planInfo.path.substring(planInfo.path.lastIndexOf('/') + 1);
              setPendingPlanApproval({
                toolCallId: part.toolCallId,
                content: 'Loading plan...',
                fromMode: 'plan',
                toMode: targetMode,
              });
              window.electronAPI
                ?.fsRead(dir, file)
                .then((result) => {
                  if (result.success && result.content) {
                    setPendingPlanApproval({
                      toolCallId: part.toolCallId,
                      content: result.content,
                      fromMode: 'plan',
                      toMode: targetMode,
                    });
                  }
                })
                .catch(() => {
                  /* ignore read errors */
                });
              return;
            }
          }

          // 3. Fallback: scan preceding text parts > 100 chars
          if (!content) {
            for (let j = pi - 1; j >= 0; j--) {
              const prev = msg.parts[j] as any;
              if (prev?.type === 'text' && prev.text?.length > 100) {
                content = prev.text;
                break;
              }
            }
          }

          // 4. Last resort: tool output
          if (!content && part.output && String(part.output).length > 50) {
            content = String(part.output);
          }

          setPendingPlanApproval({
            toolCallId: part.toolCallId,
            content,
            fromMode: 'plan',
            toMode: targetMode,
          });
          return;
        }
      }
      break; // Only check the most recent assistant message
    }
    // No pending approval found — clear
    setPendingPlanApproval(null);
  }, [messages]);

  // ── Client-side context usage estimation ──
  const estimated = useMemo(() => estimateTokensFromMessages(messages), [messages]);
  const providerDef = useMemo(() => getProvider(providerId as ProviderId), [providerId]);
  const tokenlensContext = useMemo(() => {
    if (!resolvedModelId) return undefined;
    try {
      return getContext({ modelId: resolvedModelId });
    } catch {
      return undefined;
    }
  }, [resolvedModelId]);
  const maxTokens =
    usage?.size ?? tokenlensContext?.maxTotal ?? providerDef?.contextWindow ?? 200_000;
  const effectiveUsed = usage?.used ?? estimated.total;
  const isEstimated = usage?.used == null;
  const usagePercent = maxTokens > 0 ? effectiveUsed / maxTokens : 0;
  const effectiveUsage = useMemo(
    () => ({
      inputTokens: estimated.inputTokens,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: estimated.outputTokens,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: estimated.total,
    }),
    [estimated]
  );

  // tokenlens context health — drives the compact warning bar
  const health = useMemo(() => {
    if (!resolvedModelId) return undefined;
    try {
      return contextHealth({
        modelId: resolvedModelId,
        usage: { input: effectiveUsed, output: 0 },
      });
    } catch {
      return undefined;
    }
  }, [resolvedModelId, effectiveUsed]);

  const effectiveStatus: AcpSessionStatus =
    chatStatus === 'error' ? 'error' : (chatStatus as AcpSessionStatus);

  // Queue-or-send helper — used by handleSubmit, retry, appendFn, etc.
  // If the chat is busy, queues locally for the UX chips; the backend also
  // queues as a safety net if the renderer status is stale.
  // Uses a ref so callers never hit a stale closure or TDZ during HMR.
  const safeSendRef = useRef<(payload: { text: string; files?: any[] }) => void>(() => {});
  safeSendRef.current = (payload: { text: string; files?: any[] }) => {
    resetUserNav();
    if (chatStatus !== 'ready') {
      messageQueueRef.current.push(payload);
      setQueuedMessages([...messageQueueRef.current]);
      return;
    }
    sendMessage(payload);
    scrollToBottomRef.current?.();
  };
  const safeSend = useCallback(
    (payload: { text: string; files?: any[] }) => safeSendRef.current(payload),
    []
  );

  // Expose append for external callers
  const appendFn = useCallback(
    async (msg: { content: string }) => {
      safeSend({ text: msg.content });
    },
    [safeSend]
  );

  useEffect(() => {
    onAppendRef?.(appendFn);
    return () => onAppendRef?.(null);
  }, [appendFn, onAppendRef]);

  useEffect(() => {
    if (sessionKey) onStatusChange?.(effectiveStatus, sessionKey);
  }, [effectiveStatus, sessionKey, onStatusChange]);

  // Derive pending approvals as a stable boolean to avoid re-running the effect on every message chunk
  const hasPendingApprovals = useMemo(
    () => messages.some((m) => m.parts.some((p: any) => p.state === 'approval-requested')),
    [messages]
  );

  // Update acpStatusStore so unifiedStatusStore can aggregate
  useEffect(() => {
    if (sessionKey) acpStatusStore.setStatus(sessionKey, effectiveStatus, hasPendingApprovals);
  }, [effectiveStatus, hasPendingApprovals, sessionKey]);

  // Handle approval clicks (delegated from Confirmation buttons)
  const handleApprovalClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-tool-call-id]');
      if (!target) return;
      const toolCallId = target.getAttribute('data-tool-call-id');
      const action = target.getAttribute('data-action');
      if (toolCallId && action) {
        transport.approve(toolCallId, action === 'approve');
      }
    },
    [transport]
  );

  // Keyboard shortcuts: Enter to approve, Escape to deny pending confirmations
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      // Don't intercept when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const action = e.key === 'Enter' ? 'approve' : 'deny';
      const btn = document.querySelector<HTMLElement>(
        `[data-action="${action}"][data-tool-call-id]`
      );
      if (!btn) return;

      e.preventDefault();
      const toolCallId = btn.getAttribute('data-tool-call-id');
      if (toolCallId) {
        transport.approve(toolCallId, action === 'approve');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [transport]);

  // Draft persistence
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = `valkyr:draft:${conversationId}`;

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text.trim() && message.files.length === 0) return;
      // Clear draft on send
      localStorage.removeItem(draftKey);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      // Reset history navigation on send
      historyIndexRef.current = -1;

      const payload = {
        text: message.text,
        files: message.files.length > 0 ? message.files : undefined,
      };
      safeSend(payload);
    },
    [safeSend, draftKey]
  );

  // Drain interrupt payload or queued messages when chat becomes ready
  // Merged into a single effect to avoid race conditions when both exist
  useEffect(() => {
    if (chatStatus !== 'ready') return;
    // Interrupt takes priority over queued messages
    if (interruptPayloadRef.current) {
      const payload = interruptPayloadRef.current;
      interruptPayloadRef.current = null;
      sendMessage(payload);
      return;
    }
    if (messageQueueRef.current.length > 0) {
      const next = messageQueueRef.current.shift()!;
      setQueuedMessages([...messageQueueRef.current]);
      sendMessage(next);
    }
  }, [chatStatus, sendMessage]);

  // Voice input setting
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(false);
  const [speechState, setSpeechState] = useState<SpeechButtonState>('idle');
  useEffect(() => {
    let cancelled = false;
    getSettings().then((settings) => {
      if (!cancelled && settings) {
        setVoiceInputEnabled(settings.voiceInput?.enabled ?? false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Slash command autocomplete
  const [commandFilter, setCommandFilter] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const textareaContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep textareaRef in sync with the actual textarea inside the container
  useEffect(() => {
    const el = textareaContainerRef.current?.querySelector('textarea');
    if (el) textareaRef.current = el;
  });

  // Restore draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (!saved) return;
    // Wait for textarea to be available
    const tryRestore = () => {
      const textarea = textareaContainerRef.current?.querySelector('textarea');
      if (!textarea) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(textarea, saved);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    // Small delay to ensure DOM is ready
    const timer = setTimeout(tryRestore, 50);
    return () => clearTimeout(timer);
  }, [draftKey]);

  const filteredCommands =
    commandFilter !== null
      ? availableCommands.filter((c) =>
          c.name.toLowerCase().startsWith(commandFilter.toLowerCase())
        )
      : [];

  const handleInputChange = useCallback(
    (e: React.FormEvent) => {
      const textarea = e.target as HTMLTextAreaElement;
      if (textarea.tagName !== 'TEXTAREA') return;
      const val = textarea.value;
      setInputHasText(!!val.trim());
      if (val.startsWith('/')) {
        setCommandFilter(val.slice(1));
        setCommandIndex(0);
      } else {
        setCommandFilter(null);
      }
      // Debounced draft persistence
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        if (val.trim()) {
          localStorage.setItem(draftKey, val);
        } else {
          localStorage.removeItem(draftKey);
        }
      }, 300);
    },
    [draftKey]
  );

  const selectCommand = useCallback((cmdName: string) => {
    setCommandFilter(null);
    const textarea = textareaContainerRef.current?.querySelector('textarea');
    if (!textarea) return;
    // Replace textarea value with the command
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(textarea, `/${cmdName} `);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  }, []);

  // Arrow-up/down to cycle through sent messages + slash command navigation
  const handleInputKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      // Slash command navigation
      if (filteredCommands.length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setCommandIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setCommandIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          selectCommand(filteredCommands[commandIndex].name);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setCommandFilter(null);
          return;
        }
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const textarea = e.currentTarget.querySelector('textarea') as HTMLTextAreaElement | null;
      if (!textarea) return;
      // ArrowUp: navigate history when cursor is at the start (or textarea is empty)
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      if (
        e.key === 'ArrowUp' &&
        (atStart || historyIndexRef.current >= 0) &&
        messageHistory.length > 0
      ) {
        e.preventDefault();
        e.stopPropagation();
        const newIndex =
          historyIndexRef.current === -1
            ? messageHistory.length - 1
            : Math.max(0, historyIndexRef.current - 1);
        historyIndexRef.current = newIndex;
        // Set value via native setter to trigger React's controlled input
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(textarea, messageHistory[newIndex]);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const newIndex = historyIndexRef.current + 1;
        if (newIndex >= messageHistory.length) {
          historyIndexRef.current = -1;
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          nativeSetter?.call(textarea, '');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          historyIndexRef.current = newIndex;
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          nativeSetter?.call(textarea, messageHistory[newIndex]);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    },
    [messageHistory, filteredCommands, commandIndex, selectCommand]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const clearTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(textarea, '');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    setInputHasText(false);
  }, []);

  const handleQueueFromInput = useCallback(async () => {
    const text = textareaRef.current?.value?.trim();
    if (!text) return;
    const currentFiles = promptAttachmentsRef.current?.files;
    // Convert blob URLs to data URLs before clearing (which revokes blob URLs)
    let files: typeof currentFiles | undefined;
    if (currentFiles && currentFiles.length > 0) {
      files = await Promise.all(
        currentFiles.map(async (f: { url: string; mediaType: string; filename?: string }) => {
          if (f.url?.startsWith('blob:')) {
            try {
              const resp = await fetch(f.url);
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(blob);
              });
              return { ...f, url: dataUrl };
            } catch {
              return f;
            }
          }
          return f;
        })
      );
    }
    const payload = { text, files };
    messageQueueRef.current.push(payload);
    setQueuedMessages([...messageQueueRef.current]);
    clearTextarea();
    promptAttachmentsRef.current?.clear();
  }, [clearTextarea]);

  const handleInterruptAndSend = useCallback(async () => {
    const text = textareaRef.current?.value?.trim();
    if (!text) return;
    const currentFiles = promptAttachmentsRef.current?.files;
    // Convert blob URLs to data URLs before clearing (which revokes blob URLs)
    let files: typeof currentFiles | undefined;
    if (currentFiles && currentFiles.length > 0) {
      files = await Promise.all(
        currentFiles.map(async (f: { url: string; mediaType: string; filename?: string }) => {
          if (f.url?.startsWith('blob:')) {
            try {
              const resp = await fetch(f.url);
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('FileReader failed'));
                reader.readAsDataURL(blob);
              });
              return { ...f, url: dataUrl };
            } catch {
              return f;
            }
          }
          return f;
        })
      );
    }
    interruptPayloadRef.current = { text, files };
    clearTextarea();
    promptAttachmentsRef.current?.clear();
    stop();
  }, [stop, clearTextarea]);

  const handleModeChange = useCallback(
    (modeId: string) => {
      if (!sessionKey) return;
      setCurrentModeId(modeId);
      window.electronAPI.acpSetMode({ sessionKey, mode: modeId });
    },
    [sessionKey]
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (!sessionKey) return;
      setCurrentModelId(modelId);
      window.electronAPI.acpSetModel({ sessionKey, modelId });
    },
    [sessionKey]
  );

  const removeFromQueue = useCallback((index: number) => {
    messageQueueRef.current.splice(index, 1);
    setQueuedMessages([...messageQueueRef.current]);
  }, []);

  const isStreaming = chatStatus === 'streaming' || chatStatus === 'submitted';

  const currentModel = initialModels?.availableModels.find((m) => m.id === currentModelId);

  return (
    <div className={`flex h-full flex-col ${className}`} onClick={handleApprovalClick}>
      {/* Conversation topic title — editable on click */}
      {(conversationTitle && !isGenericTitle(conversationTitle)) || sessionTitle ? (
        <div className="border-border/50 group shrink-0 border-b px-3 py-1.5">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              defaultValue={conversationTitle || sessionTitle || ''}
              className="text-foreground w-full border-none bg-transparent text-xs font-medium outline-none"
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val && val !== conversationTitle) updateTitle(val);
                setIsEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 truncate text-xs font-medium transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              title="Click to rename"
            >
              <span className="truncate">{conversationTitle || sessionTitle}</span>
              <PencilIcon className="size-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          )}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="border-border/50 flex shrink-0 items-center justify-between border-b p-3">
        {/* Left: model name */}
        <div className="flex items-center">
          {agent && initialModels && initialModels.availableModels.length > 1 && currentModelId ? (
            <ModelSelector
              onOpenChange={(open) => {
                if (!open) setHoveredModel(null);
              }}
            >
              <ModelSelectorTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors"
                >
                  <img
                    src={agent.logo}
                    alt={agent.alt}
                    className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
                  />
                  <span>{currentModel?.name ?? agent.name}</span>
                  <ChevronDownIcon className="size-3 opacity-50" />
                </button>
              </ModelSelectorTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex">
                  <Command className="w-64 **:data-[slot=command-input-wrapper]:h-auto">
                    <ModelSelectorInput placeholder="Search models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      <ModelSelectorGroup heading={agent.name}>
                        {initialModels.availableModels.map((model) => (
                          <ModelSelectorItem
                            key={model.id}
                            value={model.id}
                            onSelect={() => handleModelChange(model.id)}
                            className="flex items-center gap-2"
                            onMouseEnter={() => setHoveredModel(model)}
                            onMouseLeave={() => setHoveredModel(null)}
                          >
                            <img
                              src={agent.logo}
                              alt={agent.alt}
                              className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
                            />
                            <ModelSelectorName>{model.name}</ModelSelectorName>
                            {model.id === currentModelId && (
                              <CheckIcon className="ml-auto size-3.5 shrink-0" />
                            )}
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </Command>
                  {hoveredModel && (
                    <ModelInfoCard
                      modelId={hoveredModel.id}
                      providerId={providerId}
                      providerName={agent.name}
                      modelName={hoveredModel.name}
                      modelDescription={hoveredModel.description}
                      providerIcon={agent.logo}
                      invertIconInDark={agent.invertInDark}
                    />
                  )}
                </div>
              </PopoverContent>
            </ModelSelector>
          ) : agent ? (
            <div className="text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 px-1 text-xs">
              <img
                src={agent.logo}
                alt={agent.alt}
                className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
              />
              <span>{agent.name}</span>
            </div>
          ) : null}
        </div>

        {/* Right: plan usage + action buttons */}
        <div className="flex items-center gap-0.5">
          {claudeUsageLimits && (
            <PlanUsageHoverCard limits={claudeUsageLimits} side="bottom" align="end" />
          )}
          <button
            type="button"
            onClick={onCreateNewChat}
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            title="New Chat"
          >
            <PlusIcon className="size-3.5" />
          </button>
          {onResumeSession && sessionKey && (
            <SessionHistoryPopover
              sessionKey={sessionKey}
              currentAcpSessionId={acpSessionId}
              cwd={cwd}
              projectPath={projectPath}
              onResumeSession={onResumeSession}
            />
          )}
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            title="Settings"
          >
            <SettingsIcon className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                title="More"
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onClearChat}>
                <RefreshCwIcon className="size-4" />
                Clear Chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMoveRight} disabled={!canMoveRight}>
                <ArrowRightIcon className="size-4" />
                Move Right
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMoveLeft} disabled={!canMoveLeft}>
                <ArrowLeftIcon className="size-4" />
                Move Left
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={messages.length === 0}
                onClick={async () => {
                  const conversationMessages: ConversationMessage[] = messages.map((m) => ({
                    role: m.role,
                    content: getTextFromParts(m.parts),
                  }));
                  const markdown = messagesToMarkdown(conversationMessages);
                  try {
                    const handle = await (window as any).showSaveFilePicker({
                      suggestedName: `conversation-${Date.now()}.md`,
                      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(markdown);
                    await writable.close();
                  } catch {
                    // User cancelled the dialog
                  }
                }}
              >
                <DownloadIcon className="size-4" />
                Download Chat
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDeleteChat} className="text-red-400 focus:text-red-400">
                <Trash2Icon className="size-4" />
                Delete Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Plan — fixed above the scrollable conversation area */}
      {(planEntries.length > 0 || pendingPlanApproval) && planDismissed && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-muted/50 border-border/50 flex w-full shrink-0 items-center justify-center gap-1.5 border-b px-3 py-1 text-xs transition-colors"
          onClick={() => setPlanDismissed(false)}
        >
          <ListPlusIcon className="size-3" />
          Show last plan
        </button>
      )}
      {(planEntries.length > 0 || pendingPlanApproval) && !planDismissed && (
        <div className="border-border/50 shrink-0 border-b px-3 py-2">
          <Plan isStreaming={isStreaming} open={planOpen} onOpenChange={setPlanOpen}>
            <PlanHeader>
              <div>
                <div className="flex items-center gap-2">
                  <PlanTitle>
                    {pendingPlanApproval ? 'Plan ready for review' : 'Agent Plan'}
                  </PlanTitle>
                  {planEntries.length > 0 && !pendingPlanApproval && (
                    <PlanDescription>
                      {planEntries.filter((e) => e.status === 'completed').length}/
                      {planEntries.length} completed
                    </PlanDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <PlanTrigger />
                {!pendingPlanApproval && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
                    onClick={() => setPlanDismissed(true)}
                    title="Dismiss plan"
                  >
                    <XIcon className="size-4" />
                  </button>
                )}
              </div>
            </PlanHeader>
            <PlanContent className="mt-2">
              {/* Plan preview content from ExitPlanMode */}
              {pendingPlanApproval?.content &&
                pendingPlanApproval.content !== 'Loading plan...' && (
                  <div className="border-border/50 bg-muted/30 mb-2 max-h-80 overflow-y-auto rounded border p-3 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <Streamdown shikiTheme={['github-light', 'github-dark']}>
                      {pendingPlanApproval.content}
                    </Streamdown>
                  </div>
                )}
              {pendingPlanApproval?.content === 'Loading plan...' && (
                <div className="border-border/50 bg-muted/30 mb-2 flex items-center gap-2 rounded border p-3 text-sm">
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                  <span className="text-muted-foreground">Loading plan...</span>
                </div>
              )}
              {/* Mode switch heading — after plan content, before approve/reject */}
              {pendingPlanApproval?.fromMode && (
                <p className="mt-2 mb-0 text-sm font-medium">
                  Switch from <strong>{pendingPlanApproval.fromMode}</strong> to{' '}
                  <strong>{pendingPlanApproval.toMode || 'code'}</strong> mode?
                </p>
              )}
              {/* Task entries using Queue components */}
              {planEntries.length > 0 && (
                <QueueList className="mt-0 -mb-0">
                  {planEntries.map((entry, i) => (
                    <QueueItem key={i} className="px-0 py-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0">
                          {entry.status === 'completed' ? (
                            <CheckCircleIcon className="size-3.5 text-green-500" />
                          ) : entry.status === 'in_progress' ? (
                            <Loader2 className="text-primary size-3.5 animate-spin" />
                          ) : (
                            <ClockIcon className="text-muted-foreground size-3.5" />
                          )}
                        </span>
                        <QueueItemContent completed={entry.status === 'completed'}>
                          {entry.content}
                        </QueueItemContent>
                        {entry.priority === 'high' && (
                          <span className="ml-auto shrink-0 rounded bg-red-500/15 px-1 text-[10px] text-red-400">
                            high
                          </span>
                        )}
                      </div>
                    </QueueItem>
                  ))}
                </QueueList>
              )}
            </PlanContent>
            {/* Approve/Reject footer when ExitPlanMode awaits approval */}
            {pendingPlanApproval && (
              <PlanFooter className="mt-2 justify-between border-t pt-2">
                <span className="text-muted-foreground/60 text-xs">
                  <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Enter
                  </kbd>{' '}
                  to approve
                  {' \u00b7 '}
                  <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Esc
                  </kbd>{' '}
                  to reject
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-tool-call-id={pendingPlanApproval.toolCallId}
                    data-action="deny"
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    data-tool-call-id={pendingPlanApproval.toolCallId}
                    data-action="approve"
                  >
                    Approve
                  </Button>
                </span>
              </PlanFooter>
            )}
          </Plan>
        </div>
      )}

      {/* Messages area */}
      <Conversation>
        <ScrollBridge scrollRef={scrollToBottomRef} />
        <ConversationContent className="gap-3 p-3">
          {messages.length === 0 && parentSessionStatus === 'initializing' && (
            <div className="flex size-full flex-col items-center justify-center gap-4 p-8">
              <div className="w-full max-w-md space-y-3">
                <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
                <div className="bg-muted mt-6 h-4 w-2/3 animate-pulse rounded" />
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
              </div>
              <p className="text-muted-foreground text-xs">Resuming session…</p>
            </div>
          )}
          {messages.length === 0 &&
            parentSessionStatus !== 'initializing' &&
            chatStatus === 'ready' && (
              <ConversationEmptyState
                title="Start a conversation"
                description="Send a message to begin working with this agent"
              />
            )}

          {messages.map((msg, msgIdx) => (
            <div key={msg.id} data-message-id={msg.id} data-message-role={msg.role}>
              <Message from={msg.role}>
                <MessageContent>
                  {msg.role === 'user' ? (
                    <>
                      {(() => {
                        const fileParts = msg.parts.filter(
                          (
                            p
                          ): p is {
                            type: 'file';
                            url: string;
                            mediaType: string;
                            filename?: string;
                          } => p.type === 'file'
                        );
                        if (fileParts.length === 0) return null;
                        return (
                          <Attachments variant="inline">
                            {fileParts.map((filePart, i) => {
                              const attachmentData = {
                                ...filePart,
                                id: `msg-${i}`,
                              };
                              const mediaCategory = getMediaCategory(attachmentData);
                              const label = getAttachmentLabel(attachmentData);
                              return (
                                <AttachmentHoverCard key={i}>
                                  <AttachmentHoverCardTrigger>
                                    <Attachment data={attachmentData}>
                                      <AttachmentPreview />
                                      <AttachmentInfo />
                                    </Attachment>
                                  </AttachmentHoverCardTrigger>
                                  <AttachmentHoverCardContent>
                                    <div className="space-y-3">
                                      {mediaCategory === 'image' && filePart.url && (
                                        <div className="flex max-h-96 w-80 items-center justify-center overflow-hidden rounded-md border">
                                          <img
                                            alt={label}
                                            className="max-h-full max-w-full object-contain"
                                            height={384}
                                            src={filePart.url}
                                            width={320}
                                          />
                                        </div>
                                      )}
                                      <div className="space-y-1 px-0.5">
                                        <h4 className="text-sm leading-none font-semibold">
                                          {label}
                                        </h4>
                                        {filePart.mediaType && (
                                          <p className="text-muted-foreground font-mono text-xs">
                                            {filePart.mediaType}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </AttachmentHoverCardContent>
                                </AttachmentHoverCard>
                              );
                            })}
                          </Attachments>
                        );
                      })()}
                      <p className="whitespace-pre-wrap">{getTextFromParts(msg.parts)}</p>
                    </>
                  ) : (
                    <MessageParts
                      message={msg}
                      messages={messages}
                      chatStatus={chatStatus}
                      sessionKey={sessionKey}
                      currentModeId={currentModeId}
                      pendingPlanApproval={pendingPlanApproval}
                    />
                  )}
                  {/* Trailing activity indicator while streaming (hide when waiting for user approval) */}
                  {isStreaming &&
                    !hasPendingApprovals &&
                    msg === messages[messages.length - 1] &&
                    msg.role === 'assistant' && (
                      <div className="mt-2 flex items-center gap-2">
                        <Shimmer className="text-sm">Working…</Shimmer>
                      </div>
                    )}
                </MessageContent>
                {/* Message actions (visible on hover) */}
                {msg.role === 'assistant' && chatStatus === 'ready' && (
                  <MessageActions className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <MessageAction
                      tooltip="Copy"
                      onClick={() => {
                        const text = getTextFromParts(msg.parts);
                        navigator.clipboard.writeText(text);
                      }}
                    >
                      <CopyIcon className="size-3" />
                    </MessageAction>
                    <MessageAction
                      tooltip="Retry"
                      onClick={() => {
                        const msgIndex = messages.indexOf(msg);
                        const prevUserMsg = messages
                          .slice(0, msgIndex)
                          .reverse()
                          .find((m) => m.role === 'user');
                        if (prevUserMsg) {
                          const text = getTextFromParts(prevUserMsg.parts);
                          if (text) safeSend({ text });
                        }
                      }}
                    >
                      <RefreshCwIcon className="size-3" />
                    </MessageAction>
                  </MessageActions>
                )}
              </Message>

              {/* Resume checkpoint — shown after the last restored message */}
              {resumed !== null &&
                initialMessages.length > 0 &&
                msgIdx === initialMessages.length - 1 && (
                  <Checkpoint className="my-1">
                    <CheckpointIcon />
                    <CheckpointTrigger className="text-[10px] whitespace-nowrap" disabled>
                      {resumed ? 'Session resumed' : 'New session — context resumed'}
                    </CheckpointTrigger>
                  </Checkpoint>
                )}
              {compactBoundaryMsgId === msg.id && (
                <Checkpoint className="my-1">
                  <CheckpointIcon />
                  <CheckpointTrigger className="text-[10px] whitespace-nowrap" disabled>
                    Context compacted — earlier messages may be summarized
                  </CheckpointTrigger>
                </Checkpoint>
              )}
            </div>
          ))}

          {/* Streaming / thinking indicator */}
          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer className="text-sm">
                  {chatStatus === 'submitted' ? 'Thinking…' : 'Working…'}
                </Shimmer>
              </MessageContent>
            </Message>
          )}

          {/* Error display */}
          {chatStatus === 'error' && chatError && <AcpErrorCard error={chatError.message} />}
        </ConversationContent>
        <UserMessageNavButton
          onNavigate={() => navigateUserMessages('prev')}
          onResetNav={resetUserNav}
        />
        <ConversationScrollButton />
      </Conversation>

      {/* Queued messages */}
      {queuedMessages.length > 0 && (
        <div className="border-border/50 shrink-0 border-t px-3 py-2">
          <Queue>
            <QueueSection defaultOpen>
              <QueueSectionTrigger>
                <QueueSectionLabel
                  count={queuedMessages.length}
                  label={queuedMessages.length === 1 ? 'message queued' : 'messages queued'}
                  icon={<Loader2 className="size-3.5 animate-spin" />}
                />
              </QueueSectionTrigger>
              <QueueSectionContent>
                <QueueList>
                  {queuedMessages.map((msg, i) => (
                    <QueueItem key={i} className="flex-row items-center">
                      <QueueItemIndicator />
                      <QueueItemContent className="ml-2">
                        {msg.text}
                        {msg.files && msg.files.length > 0 && (
                          <span className="text-muted-foreground/60 ml-1.5 inline-flex items-center gap-0.5 text-[10px]">
                            <PaperclipIcon className="size-2.5" />
                            {msg.files.length}
                          </span>
                        )}
                      </QueueItemContent>
                      <QueueItemActions>
                        <QueueItemAction onClick={() => removeFromQueue(i)} title="Remove">
                          <XIcon className="size-3" />
                        </QueueItemAction>
                      </QueueItemActions>
                    </QueueItem>
                  ))}
                </QueueList>
              </QueueSectionContent>
            </QueueSection>
          </Queue>
        </div>
      )}

      {/* Context usage + plan usage (hover card) */}
      {messages.length > 0 && (
        <div className="border-border/50 flex items-center justify-end gap-1 border-t px-2 pt-1">
          {claudeUsageLimits && (
            <PlanUsageHoverCard limits={claudeUsageLimits} side="top" align="end" />
          )}
          <Context
            usedTokens={effectiveUsed}
            maxTokens={maxTokens}
            usage={effectiveUsage}
            modelId={resolvedModelId || undefined}
            cost={usage?.cost}
            estimated={isEstimated}
          >
            <ContextTrigger />
            <ContextContent side="top" align="end">
              <ContextContentHeader />
              {!isEstimated && (
                <ContextContentBody>
                  <ContextInputUsage />
                  <ContextOutputUsage />
                  <ContextReasoningUsage />
                  <ContextCacheUsage />
                </ContextContentBody>
              )}
              {claudeUsageLimits && (
                <PlanUsageContent limits={claudeUsageLimits} className="border-t" />
              )}
              <ContextContentFooter />
            </ContextContent>
          </Context>
        </div>
      )}

      {/* Compact warning bar — tokenlens contextHealth drives visibility + severity */}
      {(health ? health.status !== 'ok' : usagePercent >= 0.8) && (
        <div
          className={`flex items-center gap-2 border-t px-3 py-1.5 text-xs ${
            health?.status === 'compact' || (!health && usagePercent >= 0.95)
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          }`}
        >
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span>
            {health?.status === 'compact' || (!health && usagePercent >= 0.95)
              ? 'Context is nearly full. Type /compact now to avoid errors.'
              : `Context is ~${Math.round((health?.percentUsed ?? usagePercent) * 100)}% full. Type /compact to free space.`}
          </span>
        </div>
      )}

      {messages.length === 0 &&
        parentSessionStatus !== 'initializing' &&
        chatStatus === 'ready' && (
          <Suggestions className="flex-wrap justify-start px-3 pb-2">
            <Suggestion suggestion="Explain this codebase" onClick={(s) => safeSend({ text: s })} />
            <Suggestion suggestion="Find and fix bugs" onClick={(s) => safeSend({ text: s })} />
            <Suggestion suggestion="Write tests" onClick={(s) => safeSend({ text: s })} />
            <Suggestion suggestion="Refactor code" onClick={(s) => safeSend({ text: s })} />
          </Suggestions>
        )}

      {/* Input area */}
      <div className="border-border/50 shrink-0 border-t p-3 [&_[data-slot=input-group-addon]]:!px-0 [&_[data-slot=input-group-addon]]:!pt-0 [&_[data-slot=input-group-addon]]:!pb-0 [&_[data-slot=input-group]]:items-stretch [&_[data-slot=input-group]]:!border-0 [&_[data-slot=input-group]]:!bg-transparent [&_[data-slot=input-group]]:!ring-0 [&_[data-slot=input-group]]:![box-shadow:none] [&_[data-slot=input-group]]:dark:!bg-transparent [&_textarea]:!px-0 [&_textarea]:!py-1.5 [&_textarea]:!ring-offset-0 [&_textarea]:!outline-none">
        <PromptInput onSubmit={handleSubmit} multiple>
          <AttachmentSync targetRef={promptAttachmentsRef} />
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment key={attachment.id} data={attachment} />}
          </PromptInputAttachments>
          {/* Wrapper intercepts ArrowUp/Down for message history + slash commands */}
          <div
            ref={textareaContainerRef}
            className="relative"
            onKeyDownCapture={handleInputKeyDownCapture}
            onInput={handleInputChange}
          >
            {/* Slash command autocomplete popup */}
            {filteredCommands.length > 0 && (
              <div className="border-border bg-popover absolute bottom-full left-0 z-10 mb-1 max-h-48 w-full overflow-auto rounded-md border p-1 shadow-md">
                {filteredCommands.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    type="button"
                    className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-xs ${
                      i === commandIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'text-popover-foreground hover:bg-accent/50'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectCommand(cmd.name);
                    }}
                  >
                    <span className="font-medium">/{cmd.name}</span>
                    {cmd.description && (
                      <span className="text-muted-foreground text-[10px]">{cmd.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {speechState !== 'idle' && (
              <div className="text-muted-foreground flex items-center gap-1.5 px-0.5 pb-1 text-xs">
                {speechState === 'recording' && (
                  <>
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    Recording... click mic to stop
                  </>
                )}
                {speechState === 'transcribing' && (
                  <>
                    <span className="border-muted-foreground inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
                    Transcribing...
                  </>
                )}
              </div>
            )}
            <PromptInputTextarea
              className="min-h-10 pb-0"
              placeholder={chatStatus === 'error' ? 'Session error' : 'Type a message...'}
              disabled={chatStatus !== 'ready' && !isStreaming && transport.isReady}
            />
          </div>
          <PromptInputFooter className="pt-0">
            <PromptInputTools className="gap-1.5">
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              {voiceInputEnabled && (
                <PromptInputSpeechButton textareaRef={textareaRef} onStateChange={setSpeechState} />
              )}

              {/* Mode selector */}
              {initialModes && initialModes.availableModes.length > 1 && (
                <PromptInputSelect
                  value={currentModeId}
                  onValueChange={handleModeChange}
                  disabled={!sessionKey}
                >
                  <PromptInputSelectTrigger className="h-8 w-auto shrink-0 gap-1 px-2 text-xs whitespace-nowrap">
                    <PromptInputSelectValue />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {initialModes.availableModes.map((mode) => (
                      <SelectPrimitive.Item
                        key={mode.id}
                        value={mode.id}
                        className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-2 pl-8 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <SelectPrimitive.ItemIndicator>
                            <CheckIcon className="h-4 w-4" />
                          </SelectPrimitive.ItemIndicator>
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <SelectPrimitive.ItemText>{mode.name}</SelectPrimitive.ItemText>
                          {mode.description && (
                            <span className="text-muted-foreground text-[10px]">
                              {mode.description}
                            </span>
                          )}
                        </div>
                      </SelectPrimitive.Item>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}

              {/* Config option selectors */}
              {Array.from(configOptions.values())
                .filter(
                  (opt) =>
                    opt.type === 'enum' &&
                    opt.options &&
                    opt.options.length > 1 &&
                    opt.options.some((o) => o.value === opt.value)
                )
                .map((opt) => (
                  <PromptInputSelect
                    key={opt.optionId}
                    value={opt.value}
                    disabled={!sessionKey}
                    onValueChange={(val) => {
                      if (sessionKey)
                        window.electronAPI.acpSetConfigOption({
                          sessionKey,
                          optionId: opt.optionId,
                          value: val,
                        });
                      setConfigOptions((prev) => {
                        const next = new Map(prev);
                        next.set(opt.optionId, { ...opt, value: val });
                        return next;
                      });
                    }}
                  >
                    <PromptInputSelectTrigger
                      className="h-8 w-auto shrink-0 gap-1 px-2 text-xs whitespace-nowrap"
                      title={opt.description}
                    >
                      <PromptInputSelectValue />
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      {opt.options!.map((o) => (
                        <PromptInputSelectItem key={o.value} value={o.value}>
                          {o.label}
                        </PromptInputSelectItem>
                      ))}
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                ))}
            </PromptInputTools>
            {isStreaming && inputHasText ? (
              <div className="flex items-center gap-1">
                <InputGroupButton
                  size="icon-sm"
                  variant="ghost"
                  onClick={handleQueueFromInput}
                  title="Queue message"
                >
                  <ListPlusIcon className="size-4" />
                </InputGroupButton>
                <InputGroupButton
                  size="icon-sm"
                  variant="default"
                  onClick={handleInterruptAndSend}
                  title="Interrupt and send"
                >
                  <ArrowUpIcon className="size-4" />
                </InputGroupButton>
              </div>
            ) : isStreaming ? (
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
  taskId,
  conversationId,
  providerId,
  cwd,
  projectPath,
  isActive,
  conversationTitle,
  onConversationTitleChange,
  onStatusChange,
  onAppendRef,
  onOpenAgentSettings,
  onCreateNewChat,
  onResumeSession,
  onClearChat,
  onDeleteChat,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  className = '',
}: AcpChatPaneProps) {
  const {
    transport,
    sessionStatus,
    sessionError,
    initialMessages,
    sessionKey,
    acpSessionId,
    resumed,
    modes,
    models,
    restartSession,
  } = useAcpSession({ conversationId, providerId, cwd, projectPath, isActive });

  // Register this conversation with unifiedStatusStore for sidebar aggregation
  useEffect(() => {
    if (sessionKey && taskId) {
      unifiedStatusStore.setConversationMode(taskId, conversationId, 'acp', sessionKey);
    }
    return () => {
      if (taskId) {
        unifiedStatusStore.removeConversation(taskId, conversationId);
      }
    };
  }, [taskId, conversationId, sessionKey]);

  useEffect(() => {
    if (sessionStatus === 'initializing' && sessionKey) {
      onStatusChange?.('initializing', sessionKey);
    }
  }, [sessionStatus, sessionKey, onStatusChange]);

  useEffect(() => {
    if (sessionStatus === 'initializing') {
      onAppendRef?.(null);
    }
  }, [sessionStatus, onAppendRef]);

  // Agent unavailable error
  if (
    sessionError &&
    (sessionError.message === 'no_acp_support' || sessionError.message === 'acp_unavailable')
  ) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center gap-3 p-6 text-center ${className}`}
      >
        <AlertCircle className="text-destructive h-8 w-8" />
        <h3 className="text-sm font-semibold">Agent Unavailable</h3>
        <p className="text-muted-foreground max-w-md text-xs">
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

  // General session error with reconnect option
  if (
    sessionError &&
    sessionError.message !== 'no_acp_support' &&
    sessionError.message !== 'acp_unavailable'
  ) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center gap-3 p-6 text-center ${className}`}
      >
        <AlertCircle className="text-destructive h-8 w-8" />
        <h3 className="text-sm font-semibold">Session Error</h3>
        <p className="text-muted-foreground max-w-md text-xs">{sessionError.message}</p>
        <Button variant="outline" size="sm" onClick={restartSession}>
          <RefreshCwIcon className="mr-1.5 h-3.5 w-3.5" />
          Reconnect
        </Button>
      </div>
    );
  }

  // Loading state — show spinner only if transport isn't available yet
  if (!transport) {
    return (
      <div className={`flex h-full items-center justify-center ${className}`}>
        <Loader2 size={24} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <AcpChatInner
      conversationId={conversationId}
      providerId={providerId}
      cwd={cwd}
      projectPath={projectPath}
      transport={transport}
      initialMessages={initialMessages}
      sessionStatus={sessionStatus}
      sessionKey={sessionKey ?? null}
      acpSessionId={acpSessionId ?? null}
      resumed={resumed}
      modes={modes}
      models={models}
      conversationTitle={conversationTitle}
      onConversationTitleChange={onConversationTitleChange}
      onStatusChange={onStatusChange}
      onAppendRef={onAppendRef}
      onCreateNewChat={onCreateNewChat}
      onResumeSession={onResumeSession}
      onClearChat={onClearChat}
      onDeleteChat={onDeleteChat}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
      canMoveLeft={canMoveLeft}
      canMoveRight={canMoveRight}
      className={className}
    />
  );
}
