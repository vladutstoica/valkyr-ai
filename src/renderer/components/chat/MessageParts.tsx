import React from 'react';
import type { UIMessage } from 'ai';
import {
  getToolDisplayLabel,
  getToolStepLabel,
  getToolIconComponent,
  normalizeToolName,
  normalizeFromKind,
} from '../../lib/toolRenderer';
import { getAcpMeta } from '../../lib/acpChatTransport';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '../ai-elements/chain-of-thought';
import { mapToolStateToStepStatus } from '../ai-elements/tool';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '../ai-elements/reasoning';
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationBody,
  ConfirmationAccepted,
  ConfirmationRejected,
} from '../ai-elements/confirmation';
import { Sources, SourcesTrigger, SourcesContent, Source } from '../ai-elements/sources';
import { Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile } from '../ai-elements/task';
import { MessageResponse } from '../ai-elements/message';
import { ToolRunMiniIcons } from './ToolRunMiniIcons';
import { AcpErrorCard } from './AcpErrorCard';
import { renderTextWithCitations, renderToolContent } from './acpContentRenderers';
import { renderToolPart, StreamingToolGroup } from './acpToolRenderers';
import { extractMarkdownSources, findPlanFileInfo, summarizeToolRun } from './acpChatUtils';

interface MessagePartsProps {
  message: UIMessage;
  messages: UIMessage[];
  chatStatus: string;
  sessionKey?: string | null;
  currentModeId?: string;
  pendingPlanApproval?: { toolCallId: string } | null;
}

export function MessageParts({
  message,
  messages,
  chatStatus,
  sessionKey,
  currentModeId,
  pendingPlanApproval,
}: MessagePartsProps) {
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
          // 1. Prefer input.plan (ACP SDK >= 0.1.54)
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
