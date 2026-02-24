import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  AlertCircle,
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
  FileEditIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderTreeIcon,
  GlobeIcon,
  HistoryIcon,
  ListPlusIcon,
  Loader2,
  Loader2Icon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
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
} from '../lib/acpChatTransport';
import { Button } from './ui/button';
import { InputGroupButton } from './ui/input-group';
import {
  getToolDisplayLabel,
  getToolStepLabel,
  getToolIconComponent,
  normalizeToolName,
  getLanguageFromPath,
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
import { Command } from './ui/command';
import { ModelInfoCard } from './ModelInfoCard';

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
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  ToolInline,
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
import { Loader } from './ai-elements/loader';
import { Plan, PlanContent, PlanTrigger } from './ai-elements/plan';
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
import { Suggestions, Suggestion } from './ai-elements/suggestion';
import { Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile } from './ai-elements/task';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationSource,
} from './ai-elements/inline-citation';
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
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalStatus,
  TerminalActions,
  TerminalCopyButton,
  TerminalStopButton,
  TerminalContent,
} from './ai-elements/terminal';
import { useToolOutput } from '../lib/toolOutputStore';
import {
  StackTrace,
  StackTraceHeader,
  StackTraceError,
  StackTraceErrorType,
  StackTraceErrorMessage,
  StackTraceActions,
  StackTraceCopyButton,
  StackTraceExpandButton,
  StackTraceContent,
  StackTraceFrames,
} from './ai-elements/stack-trace';
import {
  CodeBlockContainer,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
} from './ai-elements/code-block';
import type { BundledLanguage } from 'shiki';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type AcpChatPaneProps = {
  taskId?: string;
  conversationId: string;
  providerId: string;
  cwd: string;
  projectPath?: string;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTextFromParts(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type AcpSessionInfo = {
  sessionId: string;
  title?: string | null;
  updatedAt?: string | null;
  cwd: string;
};

function SessionHistoryPopover({
  sessionKey,
  currentAcpSessionId,
  cwd,
  projectPath,
  onResumeSession,
}: {
  sessionKey: string | null;
  currentAcpSessionId: string | null;
  cwd: string;
  projectPath?: string;
  onResumeSession: (acpSessionId: string, title?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<AcpSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!sessionKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.acpListSessions({ sessionKey });
      if (result.success && result.sessions) {
        const filtered = (result.sessions as AcpSessionInfo[])
          .filter((s) => s.sessionId !== currentAcpSessionId && s.cwd === (projectPath || cwd))
          .sort((a, b) => {
            if (!a.updatedAt || !b.updatedAt) return 0;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
        setSessions(filtered);
      } else {
        setError(result.error || 'Failed to load sessions');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [sessionKey, currentAcpSessionId, cwd, projectPath]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          title="Session History"
        >
          <HistoryIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-border/50 border-b px-3 py-2">
          <p className="text-muted-foreground text-xs font-medium">Session History</p>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">{error}</div>
          )}
          {!loading && !error && sessions.length === 0 && (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">
              No previous sessions found
            </div>
          )}
          {!loading &&
            !error &&
            sessions.map((s) => (
              <button
                key={s.sessionId}
                type="button"
                className="hover:bg-accent flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors"
                onClick={() => {
                  onResumeSession(s.sessionId, s.title ?? undefined);
                  setOpen(false);
                }}
              >
                <span className="truncate text-xs font-medium">
                  {s.title || s.sessionId.slice(0, 12) + '...'}
                </span>
                {s.updatedAt && (
                  <span className="text-muted-foreground text-[10px]">
                    {formatRelativeTime(s.updatedAt)}
                  </span>
                )}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Debug overlay — hover to see raw part data (toggle: Ctrl+Shift+D)
// ---------------------------------------------------------------------------

const DebugOverlayContext = createContext(false);

/** Wrap any rendered part to show raw JSON on hover when debug mode is on. */
function DebugWrap({ data, children }: { data: unknown; children: React.ReactNode }) {
  const debug = useContext(DebugOverlayContext);
  const [show, setShow] = useState(false);
  if (!debug) return <>{children}</>;

  // Build a compact summary of the part data
  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const summary: Record<string, unknown> = {};
  for (const key of ['type', 'toolName', 'state', 'toolCallId']) {
    if (raw[key] != null) summary[key] = raw[key];
  }
  if (raw.input && typeof raw.input === 'object') {
    const inp = raw.input as Record<string, unknown>;
    const inputKeys = Object.keys(inp);
    if (inputKeys.length <= 6) {
      summary.input = inp;
    } else {
      // Show keys + truncated values
      const trimmed: Record<string, unknown> = {};
      for (const k of inputKeys.slice(0, 8)) {
        const v = inp[k];
        trimmed[k] = typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '...' : v;
      }
      if (inputKeys.length > 8) trimmed['...'] = `+${inputKeys.length - 8} more keys`;
      summary.input = trimmed;
    }
  }
  if (raw.output != null) {
    const out = String(raw.output);
    summary.output = out.length > 120 ? out.slice(0, 120) + `... (${out.length} chars)` : out;
  }
  if (raw.errorText) summary.errorText = String(raw.errorText).slice(0, 120);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {/* Blue top-left dot to indicate debug-wrapped element */}
      <div className="pointer-events-none absolute top-0 left-0 size-1.5 rounded-full bg-blue-500/60" />
      {show && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-80 max-w-lg overflow-auto rounded border border-blue-500/30 bg-zinc-900/95 p-2 font-mono text-[10px] text-zinc-300 shadow-lg backdrop-blur">
          <pre className="whitespace-pre-wrap">{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

/** Regex to detect stack traces: 3+ lines starting with "at " */
const STACK_TRACE_PATTERN = /(?:^\s*at\s+.+$[\n\r]*){3,}/m;

/** Summarize a group of tool calls by type, e.g. "Read 5 files, ran 3 commands" */
function summarizeToolRun(toolRun: Array<{ part: any }>): string {
  const counts: Record<string, number> = {};
  for (const t of toolRun) {
    const name = normalizeToolName(t.part.toolName || t.part.type?.replace(/^tool-/, '') || '');
    counts[name] = (counts[name] || 0) + 1;
  }
  const parts: string[] = [];
  if (counts.read_file)
    parts.push(`Read ${counts.read_file} file${counts.read_file > 1 ? 's' : ''}`);
  if (counts.write_file)
    parts.push(`wrote ${counts.write_file} file${counts.write_file > 1 ? 's' : ''}`);
  if (counts.edit_file)
    parts.push(`edited ${counts.edit_file} file${counts.edit_file > 1 ? 's' : ''}`);
  if (counts.bash) parts.push(`ran ${counts.bash} command${counts.bash > 1 ? 's' : ''}`);
  if (counts.search) parts.push(`searched ${counts.search} pattern${counts.search > 1 ? 's' : ''}`);
  if (counts.list_files)
    parts.push(`listed ${counts.list_files} dir${counts.list_files > 1 ? 's' : ''}`);
  if (counts.web_search)
    parts.push(`web searched ${counts.web_search} quer${counts.web_search > 1 ? 'ies' : 'y'}`);
  if (counts.web_fetch)
    parts.push(`fetched ${counts.web_fetch} URL${counts.web_fetch > 1 ? 's' : ''}`);
  if (counts.task) parts.push(`ran ${counts.task} sub-task${counts.task > 1 ? 's' : ''}`);
  const countedTypes = new Set([
    'read_file',
    'write_file',
    'edit_file',
    'bash',
    'search',
    'list_files',
    'web_search',
    'web_fetch',
    'task',
  ]);
  let other = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (!countedTypes.has(key)) other += count;
  }
  if (other > 0) parts.push(`${other} other`);
  return parts.join(', ') || `${toolRun.length} steps`;
}

/** Render a row of mini tool-type icons for a tool run group header. */
function ToolRunMiniIcons({ toolRun }: { toolRun: Array<{ part: any }> }) {
  return (
    <span className="flex items-center gap-0.5">
      {toolRun.map((t, idx) => {
        const Icon = getToolIconComponent(
          t.part.toolName || t.part.type?.replace(/^tool-/, '') || ''
        );
        return <Icon key={idx} className="text-muted-foreground/40 size-2.5" />;
      })}
    </span>
  );
}

/**
 * Terminal that subscribes to streaming tool output from the side-channel store.
 * Used for in-progress bash commands so incremental output is visible.
 */
function StreamingTerminal({
  toolCallId,
  command,
  finalOutput,
  isStreaming,
  sessionKey,
}: {
  toolCallId: string;
  command: string;
  finalOutput: string;
  isStreaming: boolean;
  sessionKey: string | null;
}) {
  const streamingOutput = useToolOutput(toolCallId);
  const output = finalOutput || streamingOutput;

  const handleStop = useCallback(() => {
    if (sessionKey) {
      window.electronAPI.acpCancel({ sessionKey });
    }
  }, [sessionKey]);

  return (
    <Terminal output={output} isStreaming={isStreaming}>
      <TerminalHeader>
        <TerminalTitle>{command ? `$ ${command.slice(0, 80)}` : 'Terminal'}</TerminalTitle>
        <div className="flex items-center gap-1">
          <TerminalStatus />
          <TerminalActions>
            {sessionKey && <TerminalStopButton onStop={handleStop} />}
            <TerminalCopyButton />
          </TerminalActions>
        </div>
      </TerminalHeader>
      <TerminalContent />
    </Terminal>
  );
}

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

/**
 * Parse sub-agent info from either structured input or ACP title.
 * ACP title format is often "AgentType: description text" or just "description text".
 */
function parseSubAgentInfo(input: Record<string, unknown>): {
  agentType: string;
  description: string;
  prompt: string;
} {
  let agentType = ((input.subagent_type || '') as string).trim();
  let description = ((input.description || '') as string).trim();
  const prompt = ((input.prompt || '') as string).trim();
  const title = ((input.title || '') as string).trim();

  // If no structured data, parse from ACP title (format: "AgentType: description")
  if (!agentType && !description && title) {
    const colonIdx = title.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      agentType = title.slice(0, colonIdx).trim();
      description = title.slice(colonIdx + 1).trim();
    } else {
      description = title;
    }
  }

  return { agentType, description, prompt };
}

/**
 * Dedicated renderer for Task (sub-agent delegation) tool calls.
 * Shows agent type badge, description, and output snippet — all visible by default.
 */
function SubAgentTool({ toolCallId, toolPart }: { toolCallId: string; toolPart: any }) {
  const [expanded, setExpanded] = useState(false);
  const streamingOutput = useToolOutput(toolCallId);
  const input = toolPart.input || {};
  const { agentType, description, prompt } = parseSubAgentInfo(input);
  const isRunning = toolPart.state === 'input-available' || toolPart.state === 'input-streaming';
  const isDone = toolPart.state === 'output-available';
  const isError = toolPart.state === 'output-error' || toolPart.state === 'output-denied';
  const finalOutput = toolPart.output != null ? String(toolPart.output) : '';

  // Show streaming content while running, final output when done
  const outputText = finalOutput || streamingOutput;
  const hasOutput = outputText.length > 0;

  // Always show last 4 lines of output inline (no expand needed)
  const outputLines = outputText.split('\n').filter((l: string) => l.trim());
  const inlineLines = outputLines.slice(-4);
  const hiddenLineCount = outputLines.length - inlineLines.length;

  // If we have nothing meaningful, don't render
  if (!agentType && !description) return null;

  return (
    <div className="not-prose mb-0.5 w-full">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${isError ? 'text-red-500' : ''}`}
      >
        <ChevronRightIcon
          className={`size-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        {isRunning ? (
          <Loader2Icon className="size-3 shrink-0 animate-spin" />
        ) : (
          <BotIcon className="size-3 shrink-0" />
        )}
        {agentType && (
          <span className="bg-primary/15 text-primary shrink-0 rounded px-1 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {agentType}
          </span>
        )}
        <span className="truncate">{description}</span>
        {isRunning && (
          <span className="text-muted-foreground/50 shrink-0 text-[10px]">running</span>
        )}
        {isDone && <CheckCircleIcon className="text-muted-foreground/50 size-3 shrink-0" />}
      </button>

      {/* Output snippet — always visible when there's output */}
      {hasOutput && !expanded && (
        <div className="border-border/40 ml-6 border-l pl-3">
          {hiddenLineCount > 0 && (
            <div className="text-muted-foreground/40 text-[10px]">
              ... {hiddenLineCount} more line{hiddenLineCount > 1 ? 's' : ''}
            </div>
          )}
          <pre className="text-muted-foreground/70 max-h-20 overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {inlineLines.join('\n')}
          </pre>
        </div>
      )}

      {/* Expanded view — full prompt + full output */}
      {expanded && (
        <div className="border-border/40 ml-6 border-l pl-3">
          {prompt && (
            <div className="text-muted-foreground/70 mt-1 mb-1 max-h-24 overflow-y-auto text-[11px] leading-relaxed">
              {prompt.length > 300 ? prompt.slice(0, 300) + '...' : prompt}
            </div>
          )}
          {hasOutput && (
            <pre className="bg-muted/40 mt-1 mb-2 max-h-48 overflow-y-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap">
              {outputText.length > 2000 ? outputText.slice(-2000) : outputText}
            </pre>
          )}
          {isRunning && !hasOutput && (
            <div className="text-muted-foreground/50 flex items-center gap-1.5 py-1 text-[11px]">
              <Loader2Icon className="size-3 animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Extract file path from tool args or ACP title. */
function extractFilePath(inputObj: Record<string, unknown>): string {
  let fp = ((inputObj.file_path || inputObj.path || inputObj.file || '') as string).trim();
  if (!fp && typeof inputObj.title === 'string' && inputObj.title) {
    const parts = inputObj.title.split(/\s+/);
    if (parts.length >= 2) fp = parts.slice(1).join(' ');
  }
  return fp;
}

/** Extract bash command from tool args or ACP title. */
function extractBashCommand(inputObj: Record<string, unknown>): string {
  let cmd = ((inputObj.command || inputObj.cmd || '') as string).trim();
  if (!cmd && typeof inputObj.title === 'string' && inputObj.title) {
    cmd = inputObj.title.replace(/^Run\s+/, '');
  }
  if (!cmd && typeof inputObj.description === 'string') {
    cmd = (inputObj.description as string).trim();
  }
  return cmd;
}

/** Compute +N / -M diff stats from old_string / new_string. */
function computeDiffStats(
  inputObj: Record<string, unknown>
): { added: number; removed: number } | null {
  const oldStr = typeof inputObj.old_string === 'string' ? inputObj.old_string : '';
  const newStr = typeof inputObj.new_string === 'string' ? inputObj.new_string : '';
  if (!oldStr && !newStr) return null;
  const oldLines = oldStr ? oldStr.split('\n').length : 0;
  const newLines = newStr ? newStr.split('\n').length : 0;
  return {
    added: Math.max(0, newLines - oldLines + (oldLines > 0 ? oldLines : 0)),
    removed: oldLines,
  };
}

/**
 * Rich tool part renderer.
 * Handles all tool types with spec-compliant compact displays.
 * Returns a React element, or null if there's not enough data to render.
 */
function renderRichToolPart(
  toolPart: any,
  i: number,
  sessionKey?: string | null
): React.ReactNode | null {
  const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
  const normalized = normalizeToolName(toolName);
  const output = toolPart.output != null ? String(toolPart.output) : '';
  const errorText = toolPart.errorText || '';
  const inputObj = toolPart.input || {};
  const key = toolPart.toolCallId || i;
  const isStreaming = toolPart.state === 'partial-call' || toolPart.state === 'call';
  const isRunning =
    toolPart.state === 'input-available' || toolPart.state === 'input-streaming' || isStreaming;
  const isError = toolPart.state === 'output-error' || toolPart.state === 'output-denied';
  const isDone = toolPart.state === 'output-available';

  // ── 1. Bash/shell ──
  if (normalized === 'bash') {
    const command = extractBashCommand(inputObj);
    const description = ((inputObj.description || '') as string).trim();

    // If we have output or are streaming, use the full terminal
    if (output || isStreaming) {
      return (
        <StreamingTerminal
          key={key}
          toolCallId={toolPart.toolCallId || `tool-${i}`}
          command={command}
          finalOutput={output}
          isStreaming={isStreaming}
          sessionKey={sessionKey ?? null}
        />
      );
    }

    // In-progress or just input available — show compact command preview
    if (!command) return null;
    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <TerminalIcon className="size-3 shrink-0" />
          )}
          <span className="truncate">{description || 'Run command'}</span>
          {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
        </div>
        <div className="mt-0.5 ml-6">
          <code className="bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
            $ {command.length > 100 ? command.slice(0, 100) + '...' : command}
          </code>
        </div>
        {errorText && (
          <pre className="mt-1 ml-6 max-h-16 overflow-hidden font-mono text-[11px] whitespace-pre-wrap text-red-500">
            {errorText.slice(0, 300)}
          </pre>
        )}
      </div>
    );
  }

  // ── 2. Error text with stack traces ──
  if (errorText && STACK_TRACE_PATTERN.test(errorText)) {
    return (
      <StackTrace key={key} trace={errorText} defaultOpen>
        <StackTraceHeader>
          <StackTraceError>
            <StackTraceErrorType />
            <StackTraceErrorMessage />
          </StackTraceError>
          <StackTraceActions>
            <StackTraceCopyButton />
            <StackTraceExpandButton />
          </StackTraceActions>
        </StackTraceHeader>
        <StackTraceContent>
          <StackTraceFrames />
        </StackTraceContent>
      </StackTrace>
    );
  }

  // ── 3. Read file ──
  if (normalized === 'read_file') {
    const filePath = extractFilePath(inputObj);
    if (!filePath) return null;
    const filename = filePath.split('/').pop() ?? '';
    const lineCount = output ? output.split('\n').length : 0;

    // With output → collapsible CodeBlock
    if (output && output.length > 0) {
      const language = getLanguageFromPath(filePath) as BundledLanguage;
      return (
        <CodeBlockContainer key={key} language={language}>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <span>
                Read <span className="font-medium">{filename}</span>
              </span>
              {lineCount > 0 && (
                <span className="text-muted-foreground/60 ml-1.5 text-[10px]">
                  {lineCount} lines
                </span>
              )}
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent code={output} language={language} showLineNumbers />
        </CodeBlockContainer>
      );
    }

    // No output yet — compact inline
    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <FileTextIcon className="size-3 shrink-0" />
          )}
          <span>
            Read <span className="font-medium">{filename}</span>
          </span>
          {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
        </div>
        <div className="text-muted-foreground/50 ml-6 truncate text-[10px]">{filePath}</div>
      </div>
    );
  }

  // ── 4. Edit file ──
  if (normalized === 'edit_file') {
    const filePath = extractFilePath(inputObj);
    if (!filePath) return null;
    const filename = filePath.split('/').pop() ?? '';
    const diffStats = computeDiffStats(inputObj);

    // With output → CodeBlock
    if (output && output.length > 0) {
      const language = getLanguageFromPath(filePath) as BundledLanguage;
      return (
        <CodeBlockContainer key={key} language={language}>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <span>
                Edit <span className="font-medium">{filename}</span>
              </span>
              {diffStats && (
                <span className="ml-1.5 text-[10px]">
                  <span className="text-green-500">+{diffStats.added}</span>{' '}
                  <span className="text-red-500">-{diffStats.removed}</span>
                </span>
              )}
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent code={output} language={language} showLineNumbers />
        </CodeBlockContainer>
      );
    }

    // No output — compact inline with diff stats
    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : isDone ? (
            <CheckCircleIcon className="size-3 shrink-0 text-green-500" />
          ) : (
            <FileEditIcon className="size-3 shrink-0" />
          )}
          <span>
            Edit <span className="font-medium">{filename}</span>
          </span>
          {diffStats && (
            <span className="text-[10px]">
              <span className="text-green-500">+{diffStats.added}</span>{' '}
              <span className="text-red-500">-{diffStats.removed}</span>
            </span>
          )}
          {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
        </div>
        <div className="text-muted-foreground/50 ml-6 truncate text-[10px]">{filePath}</div>
        {errorText && (
          <pre className="mt-1 ml-6 max-h-12 overflow-hidden font-mono text-[11px] whitespace-pre-wrap text-red-500">
            {errorText.slice(0, 200)}
          </pre>
        )}
      </div>
    );
  }

  // ── 5. Write / Create file ──
  if (normalized === 'write_file') {
    const filePath = extractFilePath(inputObj);
    if (!filePath) return null;
    const filename = filePath.split('/').pop() ?? '';
    const content = typeof inputObj.content === 'string' ? inputObj.content : '';
    const lineCount = content ? content.split('\n').length : output ? output.split('\n').length : 0;

    // With output → CodeBlock
    if (output && output.length > 0) {
      const language = getLanguageFromPath(filePath) as BundledLanguage;
      return (
        <CodeBlockContainer key={key} language={language}>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <span>
                Create <span className="font-medium">{filename}</span>
              </span>
              {lineCount > 0 && (
                <span className="ml-1.5 text-[10px] text-green-500">+{lineCount} lines</span>
              )}
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent code={output} language={language} showLineNumbers />
        </CodeBlockContainer>
      );
    }

    // No output — compact inline
    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <FilePlusIcon className="size-3 shrink-0" />
          )}
          <span>
            Create <span className="font-medium">{filename}</span>
          </span>
          {lineCount > 0 && <span className="text-[10px] text-green-500">+{lineCount} lines</span>}
          {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
        </div>
        <div className="text-muted-foreground/50 ml-6 truncate text-[10px]">{filePath}</div>
      </div>
    );
  }

  // ── 6. Search / Grep ──
  if (normalized === 'search') {
    const pattern = ((inputObj.pattern || inputObj.query || inputObj.regex || '') as string).trim();
    if (!pattern) return null;
    const scope = ((inputObj.glob || inputObj.path || inputObj.directory || '') as string).trim();
    const matchCount = output ? output.split('\n').filter((l: string) => l.trim()).length : 0;

    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <SearchIcon className="size-3 shrink-0" />
          )}
          <span>
            Search for{' '}
            <code className="bg-muted/60 rounded px-1 py-0.5 font-mono text-[11px]">
              {pattern.length > 40 ? pattern.slice(0, 40) + '...' : pattern}
            </code>
          </span>
          {isDone && matchCount > 0 && (
            <span className="text-muted-foreground/60 shrink-0 text-[10px]">
              {matchCount} match{matchCount > 1 ? 'es' : ''}
            </span>
          )}
          {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
        </div>
        {scope && (
          <div className="text-muted-foreground/50 ml-6 truncate text-[10px]">in {scope}</div>
        )}
      </div>
    );
  }

  // ── 7. List files / Glob ──
  if (normalized === 'list_files') {
    const pattern = (
      (inputObj.pattern || inputObj.path || inputObj.directory || '') as string
    ).trim();
    if (!pattern) return null;
    const fileCount = output ? output.split('\n').filter((l: string) => l.trim()).length : 0;

    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <FolderTreeIcon className="size-3 shrink-0" />
          )}
          <span>
            List{' '}
            <code className="bg-muted/60 rounded px-1 py-0.5 font-mono text-[11px]">{pattern}</code>
          </span>
          {isDone && fileCount > 0 && (
            <span className="text-muted-foreground/60 shrink-0 text-[10px]">
              {fileCount} file{fileCount > 1 ? 's' : ''}
            </span>
          )}
          {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
        </div>
      </div>
    );
  }

  // ── 8. Web search ──
  if (normalized === 'web_search') {
    const query = ((inputObj.query || '') as string).trim();
    if (!query) return null;
    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <GlobeIcon className="size-3 shrink-0" />
          )}
          <span>
            Search web for <span className="font-medium">&ldquo;{query.slice(0, 60)}&rdquo;</span>
          </span>
        </div>
      </div>
    );
  }

  // ── 9. Web fetch ──
  if (normalized === 'web_fetch') {
    const url = ((inputObj.url || '') as string).trim();
    if (!url) return null;
    let hostname = url;
    try {
      hostname = new URL(url).hostname;
    } catch {
      /* use raw url */
    }
    return (
      <div key={key} className="not-prose mb-0.5 w-full">
        <div
          className={`text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs ${isError ? 'text-red-500' : ''}`}
        >
          {isRunning ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : (
            <GlobeIcon className="size-3 shrink-0" />
          )}
          <span>
            Fetch <span className="font-medium">{hostname}</span>
          </span>
        </div>
      </div>
    );
  }

  // ── 10. Task / sub-agent ──
  if (normalized === 'task') {
    return (
      <SubAgentTool key={key} toolCallId={toolPart.toolCallId || `tool-${i}`} toolPart={toolPart} />
    );
  }

  // No rich match — fall through
  return null;
}

function renderToolPart(toolPart: any, i: number, sessionKey?: string | null) {
  const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
  if (!toolName) return null;

  // Try rich rendering first
  const rich = renderRichToolPart(toolPart, i, sessionKey);
  if (rich) {
    return (
      <DebugWrap key={`dbg-${toolPart.toolCallId || i}`} data={toolPart}>
        {rich}
      </DebugWrap>
    );
  }

  const title = getToolDisplayLabel(toolName, toolPart.input || {});
  const Icon = getToolIconComponent(toolName);

  // No label means we don't have enough info to show anything meaningful — skip
  if (!title) return null;

  // Check if this tool has meaningful expandable content
  const inputObj = toolPart.input || {};
  const hasInput = typeof inputObj === 'object' && Object.keys(inputObj).length > 0;
  const hasOutput = toolPart.output && String(toolPart.output).length > 80;
  const hasError = !!toolPart.errorText;
  const hasContent = hasInput || hasOutput || hasError;

  // Extract a brief subtitle hint from output (avoids needing to expand)
  let subtitle: string | undefined;
  if (toolPart.output) {
    const outputStr = String(toolPart.output);
    const normalized = normalizeToolName(toolName);
    if (normalized === 'read_file') {
      const lineCount = outputStr.split('\n').length;
      if (lineCount > 1) subtitle = `${lineCount} lines`;
    } else if (normalized === 'search') {
      const matchCount = outputStr.split('\n').filter((l: string) => l.trim()).length;
      if (matchCount > 0) subtitle = `${matchCount} match${matchCount > 1 ? 'es' : ''}`;
    } else if (normalized === 'list_files') {
      const fileCount = outputStr.split('\n').filter((l: string) => l.trim()).length;
      if (fileCount > 0) subtitle = `${fileCount} file${fileCount > 1 ? 's' : ''}`;
    }
  }

  // Compact inline display for tools with no useful detail
  if (!hasContent) {
    return (
      <DebugWrap key={`dbg-${toolPart.toolCallId || i}`} data={toolPart}>
        <ToolInline title={title} state={toolPart.state} icon={Icon} />
      </DebugWrap>
    );
  }

  return (
    <DebugWrap key={`dbg-${toolPart.toolCallId || i}`} data={toolPart}>
      <Tool defaultOpen={hasError}>
        <ToolHeader
          title={title}
          subtitle={subtitle}
          type={toolPart.type}
          state={toolPart.state}
          icon={Icon}
        />
        <ToolContent>
          <ToolInput input={inputObj} />
          <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
        </ToolContent>
      </Tool>
    </DebugWrap>
  );
}

/** Render text with inline citation pills when `[N]` markers and source parts exist */
function renderTextWithCitations(
  text: string,
  sources: Array<{ type: string; url?: string; title?: string; sourceId?: string }>
) {
  // Match [1], [2], etc.
  const citationPattern = /\[(\d+)\]/g;
  if (!citationPattern.test(text) || sources.length === 0) return null;

  // Reset regex state
  citationPattern.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    // Text before the citation marker
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const citationNum = parseInt(match[1], 10);
    const source = sources[citationNum - 1]; // [1] → index 0
    if (source?.url) {
      parts.push(
        <InlineCitation key={`cite-${match.index}`}>
          <InlineCitationCard>
            <InlineCitationCardTrigger sources={[source.url]} />
            <InlineCitationCardBody>
              <InlineCitationCarousel>
                <InlineCitationCarouselContent>
                  <InlineCitationCarouselItem>
                    <InlineCitationSource
                      title={source.title || `Source ${citationNum}`}
                      url={source.url}
                    />
                  </InlineCitationCarouselItem>
                </InlineCitationCarouselContent>
              </InlineCitationCarousel>
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>
      );
    } else {
      parts.push(match[0]); // No source data — keep raw text
    }
    lastIndex = citationPattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

/**
 * Extract a trailing "Sources:" section from markdown text.
 * Returns the text without the sources block and an array of parsed links.
 */
function extractMarkdownSources(
  text: string
): { text: string; sources: Array<{ title: string; url: string }> } | null {
  // Match a trailing "Sources:" or "**Sources:**" section followed by a markdown list of links
  const sourcesMatch = text.match(
    /\n\n(?:\*{0,2}Sources:?\*{0,2})\s*\n((?:\s*[-*]\s+\[.+?\]\(.+?\)\s*\n?)+)\s*$/i
  );
  if (!sourcesMatch) return null;

  const sources: Array<{ title: string; url: string }> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(sourcesMatch[1])) !== null) {
    sources.push({ title: match[1], url: match[2] });
  }

  if (sources.length === 0) return null;

  const cleanedText = text.slice(0, sourcesMatch.index!).trimEnd();
  return { text: cleanedText, sources };
}

function StreamingToolGroup({
  toolRun,
  sessionKey,
}: {
  toolRun: Array<{ part: any; index: number }>;
  sessionKey?: string | null;
}) {
  const completed: Array<{ part: any; index: number }> = [];
  const active: Array<{ part: any; index: number }> = [];
  for (const t of toolRun) {
    const s = t.part.state;
    if (s === 'output-available' || s === 'output-error' || s === 'output-denied') {
      completed.push(t);
    } else {
      active.push(t);
    }
  }
  return (
    <>
      <ChainOfThought key={`stg-${toolRun[0].index}`}>
        <ChainOfThoughtHeader>
          <span className="flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{toolRun.length} steps</span>
            <ToolRunMiniIcons toolRun={toolRun} />
          </span>
          <span className="text-muted-foreground/60 text-[10px]">{summarizeToolRun(toolRun)}</span>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {completed.map((t) => {
            const toolName = t.part.toolName || t.part.type?.replace(/^tool-/, '') || '';
            const label = getToolStepLabel(toolName, t.part.input || {});
            if (!label) return null;
            const Icon = getToolIconComponent(toolName);
            const status = mapToolStateToStepStatus(t.part.state);
            return (
              <ChainOfThoughtStep
                key={t.part.toolCallId || t.index}
                icon={Icon}
                label={label}
                status={status}
              />
            );
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
      {active.map((t) => renderToolPart(t.part, t.index, sessionKey))}
    </>
  );
}

function MessageParts({
  message,
  chatStatus,
  sessionKey,
  currentModeId,
}: {
  message: UIMessage;
  chatStatus: string;
  sessionKey?: string | null;
  currentModeId?: string;
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
              const label = getToolStepLabel(toolName, t.part.input || {});
              if (!label) return null;
              const Icon = getToolIconComponent(toolName);
              const status = mapToolStateToStepStatus(t.part.state);
              return (
                <ChainOfThoughtStep
                  key={t.part.toolCallId || t.index}
                  icon={Icon}
                  label={label}
                  status={status}
                />
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
        const title = getToolDisplayLabel(toolName, toolPart.input || {});
        const approval =
          toolPart.state === 'output-denied'
            ? { id: toolPart.toolCallId, approved: false as const }
            : { id: toolPart.toolCallId };

        const isModeSwitch =
          toolName === 'switch_mode' || toolName === 'ExitPlanMode' || toolName === 'EnterPlanMode';
        const targetMode = (toolPart.input?.mode_slug || toolPart.input?.mode || '') as string;

        // For mode switches, find the preceding plan file content to show inline
        let planPreviewContent: string | null = null;
        if (isModeSwitch) {
          for (let j = i - 1; j >= 0; j--) {
            const prev = message.parts[j] as any;
            // Check text parts for plan content (agents often output plan as text before ExitPlanMode)
            if (prev?.type === 'text' && prev.text && prev.text.length > 100) {
              planPreviewContent = prev.text;
              break;
            }
            const prevToolName = prev?.toolName || prev?.type?.replace(/^tool-/, '') || '';
            const prevNormalized = normalizeToolName(prevToolName);
            if (prevNormalized === 'edit_file' || prevNormalized === 'write_file') {
              const filePath = (prev.input?.file_path ||
                prev.input?.path ||
                prev.input?.file ||
                prev.input?.title ||
                '') as string;
              if (filePath.endsWith('.md') && prev.output) {
                planPreviewContent = String(prev.output);
                break;
              }
            }
          }
          // Also check the tool's own output
          if (!planPreviewContent && toolPart.output && String(toolPart.output).length > 50) {
            planPreviewContent = String(toolPart.output);
          }
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
              Allow <strong>{title}</strong>?
            </>
          );
        } else {
          // No meaningful label available — show the raw tool name so the user
          // can at least see the tool type rather than a blank prompt
          confirmTitle = (
            <>
              Allow <strong>{toolName || 'tool call'}</strong>?
            </>
          );
        }

        // Build a detail preview for tool inputs so the user knows what they're approving
        const toolInput = toolPart.input || {};
        const normalized = normalizeToolName(toolName);
        let inputPreview: string | null = null;
        if (!isModeSwitch) {
          if (normalized === 'bash') {
            const cmd = (toolInput.command || toolInput.cmd || '') as string;
            if (cmd) inputPreview = cmd;
          } else if (normalized === 'edit_file' || normalized === 'write_file') {
            const fp = (toolInput.file_path || toolInput.path || toolInput.file || '') as string;
            if (fp) inputPreview = fp;
          } else if (normalized === 'read_file') {
            const fp = (toolInput.file_path || toolInput.path || toolInput.file || '') as string;
            if (fp) inputPreview = fp;
          }
          // If we still have no preview and there is raw input, show it as JSON
          // so the user can always see exactly what they're approving
          if (!inputPreview && toolInput && Object.keys(toolInput).length > 0) {
            // Filter out the 'title' key which is our own metadata
            const displayInput = Object.fromEntries(
              Object.entries(toolInput).filter(([k]) => k !== 'title')
            );
            if (Object.keys(displayInput).length > 0) {
              inputPreview = JSON.stringify(displayInput, null, 2);
            }
          }
        }

        // Use title for after-the-fact labels, fall back to toolName
        const displayTitle = title || toolName || 'tool call';

        elements.push(
          <Confirmation key={toolPart.toolCallId || i} state={toolPart.state} approval={approval}>
            <ConfirmationTitle>{confirmTitle}</ConfirmationTitle>
            {(planPreviewContent || inputPreview) && (
              <ConfirmationBody className="border-border/50 bg-muted/30 max-h-72 overflow-y-auto rounded border p-3">
                <pre className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {planPreviewContent || inputPreview}
                </pre>
              </ConfirmationBody>
            )}
            <ConfirmationRequest>
              <ConfirmationActions className="w-full justify-between">
                <span className="text-muted-foreground/60 text-xs">
                  <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Enter
                  </kbd>{' '}
                  to allow
                  {' \u00b7 '}
                  <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Esc
                  </kbd>{' '}
                  to deny
                </span>
                <span className="flex items-center gap-2">
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
                </span>
              </ConfirmationActions>
            </ConfirmationRequest>
            <ConfirmationAccepted>
              Allowed <strong>{displayTitle}</strong>
            </ConfirmationAccepted>
            <ConfirmationRejected>
              Denied <strong>{displayTitle}</strong>
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
        default:
          break;
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
        <Sources>
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
  sessionKey: string | null;
  acpSessionId: string | null;
  resumed: boolean | null;
  modes: AcpSessionModes;
  models: AcpSessionModels;
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
  sessionKey,
  acpSessionId,
  resumed,
  modes: initialModes,
  models: initialModels,
  onStatusChange,
  onAppendRef,
  onCreateNewChat,
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

  // Debug overlay toggle (Ctrl+Shift+D) — shows raw part data on hover
  const [debugOverlay, setDebugOverlay] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDebugOverlay((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Sync mode/model when initial data arrives (useState only captures the first value)
  useEffect(() => {
    if (initialModes?.currentModeId) setCurrentModeId(initialModes.currentModeId);
  }, [initialModes?.currentModeId]);
  useEffect(() => {
    if (initialModels?.currentModelId) setCurrentModelId(initialModels.currentModelId);
  }, [initialModels?.currentModelId]);

  // Arrow-up message recall
  const [messageHistory, setMessageHistory] = useState<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Message queue for rapid sends
  const messageQueueRef = useRef<Array<{ text: string; files?: any[] }>>([]);
  const [queuedMessages, setQueuedMessages] = useState<Array<{ text: string; files?: any[] }>>([]);

  // Track whether textarea has content (for interrupt vs queue buttons during streaming)
  const [inputHasText, setInputHasText] = useState(false);
  const interruptPayloadRef = useRef<{ text: string; files?: any[] } | null>(null);

  // External ref to PromptInput attachments — synced by AttachmentSync below
  const promptAttachmentsRef = useRef<{ files: any[]; clear: () => void } | null>(null);

  // Side-channel state
  const [usage, setUsage] = useState<AcpUsageData | null>(null);
  const [planEntries, setPlanEntries] = useState<AcpPlanEntry[]>([]);
  const [availableCommands, setAvailableCommands] = useState<AcpCommand[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [configOptions, setConfigOptions] = useState<Map<string, AcpConfigOption>>(new Map());

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
        if (info.title) setSessionTitle(info.title);
      },
    };
    return () => {
      transport.sideChannel = {};
    };
  }, [transport]);

  const agent = agentConfig[providerId as Agent];
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
    },
  });

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

  // Auto-prune: when context usage > 90%, keep only the last 10 messages
  useEffect(() => {
    if (!usage || !usage.size || !usage.used) return;
    if (usage.used / usage.size > 0.9 && messages.length > 12) {
      const pruned = messages.slice(-10);
      setMessages(pruned);
    }
  }, [usage, messages, setMessages]);

  const effectiveStatus: AcpSessionStatus =
    chatStatus === 'error' ? 'error' : (chatStatus as AcpSessionStatus);

  // Expose append for external callers
  const appendFn = useCallback(
    async (msg: { content: string }) => {
      sendMessage({ text: msg.content });
    },
    [sendMessage]
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
      // Track in history for arrow-up recall
      if (message.text.trim()) {
        setMessageHistory((prev) => [...prev, message.text.trim()]);
        historyIndexRef.current = -1;
      }

      const payload = {
        text: message.text,
        files: message.files.length > 0 ? message.files : undefined,
      };
      // Queue if the chat is busy processing a previous message
      if (chatStatus !== 'ready') {
        messageQueueRef.current.push(payload);
        setQueuedMessages([...messageQueueRef.current]);
        return;
      }
      sendMessage(payload);
    },
    [sendMessage, chatStatus, draftKey]
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
    window.electronAPI.getSettings().then((res) => {
      if (!cancelled && res.success) {
        setVoiceInputEnabled(res.settings?.voiceInput?.enabled ?? false);
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
      // Only activate when textarea is empty (ArrowUp) or navigating history (ArrowDown)
      if (e.key === 'ArrowUp' && textarea.value === '' && messageHistory.length > 0) {
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

  const handleQueueFromInput = useCallback(() => {
    const text = textareaRef.current?.value?.trim();
    if (!text) return;
    const currentFiles = promptAttachmentsRef.current?.files;
    const payload = {
      text,
      files: currentFiles && currentFiles.length > 0 ? [...currentFiles] : undefined,
    };
    messageQueueRef.current.push(payload);
    setQueuedMessages([...messageQueueRef.current]);
    clearTextarea();
    promptAttachmentsRef.current?.clear();
  }, [clearTextarea]);

  const handleInterruptAndSend = useCallback(() => {
    const text = textareaRef.current?.value?.trim();
    if (!text) return;
    const currentFiles = promptAttachmentsRef.current?.files;
    interruptPayloadRef.current = {
      text,
      files: currentFiles && currentFiles.length > 0 ? [...currentFiles] : undefined,
    };
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
      {/* Session title */}
      {sessionTitle && (
        <div className="border-border/50 text-muted-foreground shrink-0 truncate border-b px-3 py-1.5 text-xs font-medium">
          {sessionTitle}
        </div>
      )}

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

      {/* Messages area */}
      <DebugOverlayContext.Provider value={debugOverlay}>
        {debugOverlay && (
          <div className="border-b border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] text-blue-400">
            Debug overlay ON — hover parts to inspect raw data (Ctrl+Shift+D to toggle)
          </div>
        )}
        <Conversation>
          <ConversationContent className="gap-3 p-3">
            {messages.length === 0 && chatStatus === 'ready' && (
              <>
                <ConversationEmptyState
                  title="Start a conversation"
                  description="Send a message to begin working with this agent"
                />
                <Suggestions className="justify-center px-4">
                  <Suggestion
                    suggestion="Explain this codebase"
                    onClick={(s) => sendMessage({ text: s })}
                  />
                  <Suggestion
                    suggestion="Find and fix bugs"
                    onClick={(s) => sendMessage({ text: s })}
                  />
                  <Suggestion suggestion="Write tests" onClick={(s) => sendMessage({ text: s })} />
                  <Suggestion
                    suggestion="Refactor code"
                    onClick={(s) => sendMessage({ text: s })}
                  />
                </Suggestions>
              </>
            )}

            {messages.map((msg, msgIdx) => (
              <div key={msg.id}>
                {/* Checkpoint separator between conversation turns */}
                {msgIdx > 0 &&
                  msg.role === 'user' &&
                  messages[msgIdx - 1]?.role === 'assistant' && (
                    <Checkpoint className="my-1">
                      <CheckpointIcon />
                      <CheckpointTrigger
                        className="text-[10px] whitespace-nowrap"
                        tooltip="Restore to this point"
                        disabled={isStreaming}
                        onClick={() => setMessages(messages.slice(0, msgIdx))}
                      >
                        Turn {messages.slice(0, msgIdx).filter((m) => m.role === 'user').length + 1}
                      </CheckpointTrigger>
                    </Checkpoint>
                  )}
                <Message from={msg.role}>
                  <MessageContent>
                    {msg.role === 'user' ? (
                      <>
                        {msg.parts
                          .filter(
                            (
                              p
                            ): p is {
                              type: 'file';
                              url: string;
                              mediaType: string;
                              filename?: string;
                            } => p.type === 'file'
                          )
                          .map((filePart, i) =>
                            filePart.mediaType.startsWith('image/') ? (
                              <img
                                key={i}
                                src={filePart.url}
                                alt={filePart.filename || 'Attached image'}
                                className="border-border/50 max-h-64 max-w-full rounded-md border"
                              />
                            ) : (
                              <div
                                key={i}
                                className="border-border/50 text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                              >
                                <PaperclipIcon className="size-3" />
                                {filePart.filename || 'Attachment'}
                              </div>
                            )
                          )}
                        <p className="whitespace-pre-wrap">{getTextFromParts(msg.parts)}</p>
                      </>
                    ) : (
                      <MessageParts
                        message={msg}
                        chatStatus={chatStatus}
                        sessionKey={sessionKey}
                        currentModeId={currentModeId}
                      />
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
                            if (text) sendMessage({ text });
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
              </div>
            ))}

            {/* Streaming / thinking indicator */}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <Message from="assistant">
                <MessageContent>
                  {chatStatus === 'submitted' ? (
                    <Shimmer className="text-sm">Thinking…</Shimmer>
                  ) : (
                    <Loader />
                  )}
                </MessageContent>
              </Message>
            )}

            {/* Inline plan */}
            {planEntries.length > 0 && (
              <div className="px-2">
                <Plan isStreaming={isStreaming} defaultOpen>
                  <PlanTrigger
                    completed={planEntries.filter((e) => e.status === 'completed').length}
                    total={planEntries.length}
                  />
                  <PlanContent>
                    <ul className="space-y-1 text-xs">
                      {planEntries.map((entry, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0">
                            {entry.status === 'completed' ? (
                              <CheckCircleIcon className="size-3.5 text-green-500" />
                            ) : entry.status === 'in_progress' ? (
                              <Loader2 className="text-primary size-3.5 animate-spin" />
                            ) : (
                              <ClockIcon className="text-muted-foreground size-3.5" />
                            )}
                          </span>
                          <span
                            className={
                              entry.status === 'completed'
                                ? 'text-muted-foreground line-through'
                                : ''
                            }
                          >
                            {entry.content}
                          </span>
                          {entry.priority === 'high' && (
                            <span className="ml-auto shrink-0 rounded bg-red-500/15 px-1 text-[10px] text-red-400">
                              high
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </PlanContent>
                </Plan>
              </div>
            )}

            {/* Error display */}
            {chatStatus === 'error' && chatError && (
              <div className="mx-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <p>{chatError.message}</p>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </DebugOverlayContext.Provider>

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
      {usage && usage.size && usage.used != null && (
        <div className="border-border/50 flex items-center justify-end gap-1 border-t px-2 pt-1">
          {claudeUsageLimits && (
            <PlanUsageHoverCard limits={claudeUsageLimits} side="top" align="end" />
          )}
          <Context usedTokens={usage.used} maxTokens={usage.size} cost={usage.cost}>
            <ContextTrigger />
            <ContextContent side="top" align="end">
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextOutputUsage />
                <ContextReasoningUsage />
                <ContextCacheUsage />
              </ContextContentBody>
              {claudeUsageLimits && (
                <PlanUsageContent limits={claudeUsageLimits} className="border-t" />
              )}
              <ContextContentFooter />
            </ContextContent>
          </Context>
        </div>
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
              placeholder={
                chatStatus === 'error'
                  ? 'Session error'
                  : !transport.isReady
                    ? 'Connecting...'
                    : 'Type a message...'
              }
              disabled={chatStatus !== 'ready' && !isStreaming}
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
  } = useAcpSession({ conversationId, providerId, cwd, projectPath });

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
      sessionKey={sessionKey ?? null}
      acpSessionId={acpSessionId ?? null}
      resumed={resumed}
      modes={modes}
      models={models}
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
