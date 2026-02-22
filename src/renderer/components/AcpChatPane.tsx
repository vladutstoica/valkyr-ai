import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { AlertCircle, ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, CheckIcon, ChevronDownIcon, ClockIcon, CopyIcon, Loader2, MoreHorizontalIcon, PaperclipIcon, PlusIcon, RefreshCwIcon, SettingsIcon, Trash2Icon, WrenchIcon } from 'lucide-react';
import { useAcpSession } from '../hooks/useAcpSession';
import { AcpChatTransport, type AcpUsageData, type AcpPlanEntry, type AcpCommand, type AcpConfigOption } from '../lib/acpChatTransport';
import { Button } from './ui/button';
import { getToolDisplayLabel, getToolIconComponent } from '../lib/toolRenderer';
import type { AcpSessionStatus, AcpSessionModes, AcpSessionModels, AcpSessionModel } from '../types/electron-api';
import { acpStatusStore } from '../lib/acpStatusStore';
import { unifiedStatusStore } from '../lib/unifiedStatusStore';
import { agentConfig } from '../lib/agentConfig';
import { ModelInfoCard } from './ModelInfoCard';
import type { Agent } from '../types';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check } from 'lucide-react';

// AI Elements
import { Message, MessageContent, MessageResponse, MessageActions, MessageAction } from './ai-elements/message';
import { Reasoning, ReasoningTrigger, ReasoningContent } from './ai-elements/reasoning';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput, ToolInline, ToolGroup } from './ai-elements/tool';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from './ai-elements/conversation';
import { Loader } from './ai-elements/loader';
import { Plan, PlanHeader, PlanTitle, PlanContent, PlanFooter, PlanTrigger } from './ai-elements/plan';
import { Sources, SourcesTrigger, SourcesContent, Source } from './ai-elements/sources';
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from './ai-elements/checkpoint';
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
  type PromptInputMessage,
} from './ai-elements/prompt-input';
import { Confirmation, ConfirmationActions, ConfirmationAction, ConfirmationTitle, ConfirmationRequest } from './ai-elements/confirmation';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type AcpChatPaneProps = {
  taskId?: string;
  conversationId: string;
  providerId: string;
  cwd: string;
  autoApprove?: boolean;
  onStatusChange?: (status: AcpSessionStatus, sessionKey: string) => void;
  onAppendRef?: (fn: ((msg: { content: string }) => Promise<void>) | null) => void;
  onOpenAgentSettings?: () => void;
  onCreateNewChat?: () => void;
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

type ModelPickerProps = {
  agent: { name: string; logo: string; alt: string; invertInDark?: boolean };
  providerId: string;
  models: AcpSessionModel[];
  currentModelId: string;
  onModelChange: (modelId: string) => void;
};

function ModelPicker({ agent, providerId, models, currentModelId, onModelChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<AcpSessionModel | null>(null);

  const currentModel = models.find((m) => m.id === currentModelId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <img
            src={agent.logo}
            alt={agent.alt}
            className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
          />
          <span>{currentModel?.name ?? agent.name}</span>
          <ChevronDownIcon className="size-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto min-w-[200px] max-w-[480px] rounded-md p-0"
      >
        <div className="flex">
          {/* Model list */}
          <div className="min-w-[200px] max-h-[300px] overflow-auto py-1">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  model.id === currentModelId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-popover-foreground hover:bg-accent/50'
                }`}
                onMouseEnter={() => setHoveredModel(model)}
                onMouseLeave={() => setHoveredModel(null)}
                onClick={() => {
                  onModelChange(model.id);
                  setOpen(false);
                }}
              >
                {model.id === currentModelId ? (
                  <CheckIcon className="size-3 shrink-0" />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <span>{model.name}</span>
              </button>
            ))}
          </div>

          {/* Hover detail panel — model info card with pricing, status & uptime */}
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
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function renderToolPart(toolPart: any, i: number) {
  const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
  if (!toolName) return null;
  const title = getToolDisplayLabel(toolName, toolPart.input || {});
  const Icon = getToolIconComponent(toolName);

  // Check if this tool has meaningful expandable content
  const inputObj = toolPart.input || {};
  const hasInput = typeof inputObj === 'object' && Object.keys(inputObj).length > 0;
  const hasOutput = toolPart.output && String(toolPart.output).length > 80;
  const hasError = !!toolPart.errorText;
  const hasContent = hasInput || hasOutput || hasError;

  // Compact inline display for tools with no useful detail
  if (!hasContent) {
    return (
      <ToolInline
        key={toolPart.toolCallId || i}
        title={title}
        state={toolPart.state}
        icon={Icon}
      />
    );
  }

  return (
    <Tool key={toolPart.toolCallId || i} defaultOpen={hasError}>
      <ToolHeader
        title={title}
        type={toolPart.type}
        state={toolPart.state}
        icon={Icon}
      />
      <ToolContent>
        <ToolInput input={inputObj} />
        <ToolOutput
          output={toolPart.output}
          errorText={toolPart.errorText}
        />
      </ToolContent>
    </Tool>
  );
}

function MessageParts({ message, chatStatus }: { message: UIMessage; chatStatus: string }) {
  // Collect source parts for grouped rendering
  const sourceParts = message.parts.filter(
    (p) => p.type === 'source-url' || p.type === 'source-document'
  ) as Array<{ type: string; url?: string; title?: string; sourceId?: string }>;

  // Group consecutive completed tool parts (3+) into collapsible groups
  const elements: React.ReactNode[] = [];
  let toolRun: Array<{ part: any; index: number }> = [];

  const flushToolRun = () => {
    if (toolRun.length === 0) return;
    const allCompleted = toolRun.every(
      (t) => t.part.state === 'output-available' || t.part.state === 'output-error' || t.part.state === 'output-denied'
    );
    if (allCompleted && toolRun.length >= 3) {
      elements.push(
        <ToolGroup key={`tg-${toolRun[0].index}`} count={toolRun.length}>
          {toolRun.map((t) => renderToolPart(t.part, t.index))}
        </ToolGroup>
      );
    } else {
      for (const t of toolRun) {
        elements.push(renderToolPart(t.part, t.index));
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
      // Approval-requested tools break out of grouping
      if (toolPart.state === 'approval-requested') {
        flushToolRun();
        const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
        const title = getToolDisplayLabel(toolName, toolPart.input || {});
        elements.push(
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
      } else {
        toolRun.push({ part: toolPart, index: i });
      }
    } else {
      flushToolRun();
      switch (part.type) {
        case 'text':
          elements.push(<MessageResponse key={i}>{part.text}</MessageResponse>);
          break;
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

  return (
    <>
      {elements}

      {/* Sources (grouped) */}
      {sourceParts.length > 0 && (
        <Sources>
          <SourcesTrigger count={sourceParts.length} />
          <SourcesContent>
            {sourceParts.map((src, i) => (
              <Source key={i} href={(src as any).url} title={(src as any).title || (src as any).url || `Source ${i + 1}`} />
            ))}
          </SourcesContent>
        </Sources>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inner component — mounts only when transport is ready
// ---------------------------------------------------------------------------

type AcpChatInnerProps = {
  conversationId: string;
  providerId: string;
  transport: AcpChatTransport;
  initialMessages: UIMessage[];
  sessionKey: string;
  modes: AcpSessionModes;
  models: AcpSessionModels;
  autoApproveInitial?: boolean;
  onStatusChange?: (status: AcpSessionStatus, sessionKey: string) => void;
  onAppendRef?: (fn: ((msg: { content: string }) => Promise<void>) | null) => void;
  onCreateNewChat?: () => void;
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
  transport,
  initialMessages,
  sessionKey,
  modes: initialModes,
  models: initialModels,
  autoApproveInitial = false,
  onStatusChange,
  onAppendRef,
  onCreateNewChat,
  onClearChat,
  onDeleteChat,
  onMoveLeft,
  onMoveRight,
  canMoveLeft = true,
  canMoveRight = true,
  className,
}: AcpChatInnerProps) {
  const [autoApprove, setAutoApprove] = useState(autoApproveInitial);
  const [currentModeId, setCurrentModeId] = useState(initialModes?.currentModeId ?? '');
  const [currentModelId, setCurrentModelId] = useState(initialModels?.currentModelId ?? '');

  // Arrow-up message recall
  const [messageHistory, setMessageHistory] = useState<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Message queue for rapid sends
  const messageQueueRef = useRef<Array<{ text: string; files?: any[] }>>([]);

  // Side-channel state
  const [usage, setUsage] = useState<AcpUsageData | null>(null);
  const [planEntries, setPlanEntries] = useState<AcpPlanEntry[]>([]);
  const [availableCommands, setAvailableCommands] = useState<AcpCommand[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [configOptions, setConfigOptions] = useState<Map<string, AcpConfigOption>>(new Map());

  // Sync autoApprove to transport (transport is mutable by design)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    transport.autoApprove = autoApprove;
  }, [transport, autoApprove]);

  // Wire side-channel callbacks on transport
  useEffect(() => {
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
      onSessionInfoUpdate: (info) => { if (info.title) setSessionTitle(info.title); },
    };
    return () => { transport.sideChannel = {}; };
  }, [transport]);

  const agent = agentConfig[providerId as Agent];
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
      window.electronAPI.saveMessage({
        id: message.id,
        conversationId,
        content: textContent,
        sender: 'assistant',
        parts: JSON.stringify(message.parts),
      }).catch(() => { /* non-fatal */ });
    },
  });

  // Auto-prune: when context usage > 90%, keep only the last 10 messages
  useEffect(() => {
    if (!usage || !usage.size || !usage.used) return;
    if (usage.used / usage.size > 0.9 && messages.length > 12) {
      const pruned = messages.slice(-10);
      setMessages(pruned);
    }
  }, [usage, messages, setMessages]);

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
    onStatusChange?.(effectiveStatus, sessionKey);
  }, [effectiveStatus, sessionKey, onStatusChange]);

  // Update acpStatusStore so unifiedStatusStore can aggregate
  useEffect(() => {
    const hasPending = messages.some((m) =>
      m.parts.some((p: any) => p.state === 'approval-requested')
    );
    acpStatusStore.setStatus(sessionKey, effectiveStatus, hasPending);
  }, [effectiveStatus, messages, sessionKey]);

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
    if (!message.text.trim() && message.files.length === 0) return;
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
      return;
    }
    sendMessage(payload);
  }, [sendMessage, chatStatus]);

  // Drain queued messages when chat becomes ready
  useEffect(() => {
    if (chatStatus === 'ready' && messageQueueRef.current.length > 0) {
      const next = messageQueueRef.current.shift()!;
      sendMessage(next);
    }
  }, [chatStatus, sendMessage]);

  // Slash command autocomplete
  const [commandFilter, setCommandFilter] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const textareaContainerRef = useRef<HTMLDivElement>(null);

  const filteredCommands = commandFilter !== null
    ? availableCommands.filter((c) =>
        c.name.toLowerCase().startsWith(commandFilter.toLowerCase())
      )
    : [];

  const handleInputChange = useCallback((e: React.FormEvent) => {
    const textarea = (e.target as HTMLTextAreaElement);
    if (textarea.tagName !== 'TEXTAREA') return;
    const val = textarea.value;
    if (val.startsWith('/')) {
      setCommandFilter(val.slice(1));
      setCommandIndex(0);
    } else {
      setCommandFilter(null);
    }
  }, []);

  const selectCommand = useCallback((cmdName: string) => {
    setCommandFilter(null);
    const textarea = textareaContainerRef.current?.querySelector('textarea');
    if (!textarea) return;
    // Replace textarea value with the command
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    nativeSetter?.call(textarea, `/${cmdName} `);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  }, []);

  // Arrow-up/down to cycle through sent messages + slash command navigation
  const handleInputKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
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
      const newIndex = historyIndexRef.current === -1
        ? messageHistory.length - 1
        : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = newIndex;
      // Set value via native setter to trigger React's controlled input
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      nativeSetter?.call(textarea, messageHistory[newIndex]);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      e.preventDefault();
      e.stopPropagation();
      const newIndex = historyIndexRef.current + 1;
      if (newIndex >= messageHistory.length) {
        historyIndexRef.current = -1;
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, '');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        historyIndexRef.current = newIndex;
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeSetter?.call(textarea, messageHistory[newIndex]);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, [messageHistory]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleModeChange = useCallback((modeId: string) => {
    setCurrentModeId(modeId);
    window.electronAPI.acpSetMode({ sessionKey, mode: modeId });
  }, [sessionKey]);

  const handleModelChange = useCallback((modelId: string) => {
    setCurrentModelId(modelId);
    window.electronAPI.acpSetModel({ sessionKey, modelId });
  }, [sessionKey]);

  const isStreaming = chatStatus === 'streaming' || chatStatus === 'submitted';

  return (
    <div className={`flex h-full flex-col ${className}`} onClick={handleApprovalClick}>
      {/* Session title */}
      {sessionTitle && (
        <div className="shrink-0 border-b border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground truncate">
          {sessionTitle}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 p-3">
        {/* Left: model name */}
        <div className="flex items-center">
          {agent && initialModels && initialModels.availableModels.length > 1 && currentModelId ? (
            <ModelPicker
              agent={agent}
              providerId={providerId}
              models={initialModels.availableModels}
              currentModelId={currentModelId}
              onModelChange={handleModelChange}
            />
          ) : agent ? (
            <div className="flex h-7 shrink-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
              <img
                src={agent.logo}
                alt={agent.alt}
                className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
              />
              <span>{agent.name}</span>
            </div>
          ) : null}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onCreateNewChat}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="New Chat"
          >
            <PlusIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Settings"
          >
            <SettingsIcon className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
      <Conversation>
        <ConversationContent className="gap-3 p-3">
          {messages.length === 0 && chatStatus === 'ready' && (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to begin working with this agent"
            />
          )}

          {messages.map((msg, msgIdx) => (
            <div key={msg.id}>
              {/* Checkpoint separator between conversation turns */}
              {msgIdx > 0 && msg.role === 'user' && messages[msgIdx - 1]?.role === 'assistant' && (
                <Checkpoint className="my-1">
                  <CheckpointIcon />
                  <CheckpointTrigger
                    className="text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none"
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
                      .filter((p): p is { type: 'file'; url: string; mediaType: string; filename?: string } => p.type === 'file')
                      .map((filePart, i) =>
                        filePart.mediaType.startsWith('image/') ? (
                          <img
                            key={i}
                            src={filePart.url}
                            alt={filePart.filename || 'Attached image'}
                            className="max-h-64 max-w-full rounded-md border border-border/50"
                          />
                        ) : (
                          <div key={i} className="flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground">
                            <PaperclipIcon className="size-3" />
                            {filePart.filename || 'Attachment'}
                          </div>
                        )
                      )}
                    <p className="whitespace-pre-wrap">{getTextFromParts(msg.parts)}</p>
                  </>
                ) : (
                  <MessageParts message={msg} chatStatus={chatStatus} />
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
                      const prevUserMsg = messages.slice(0, msgIndex).reverse().find((m) => m.role === 'user');
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
            </div>
          ))}

          {/* Streaming / thinking indicator */}
          {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <Message from="assistant">
              <MessageContent>
                {chatStatus === 'submitted' ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block size-2 animate-pulse rounded-full bg-muted-foreground" />
                    Thinking…
                  </div>
                ) : (
                  <Loader />
                )}
              </MessageContent>
            </Message>
          )}

          {/* Inline plan card */}
          {planEntries.length > 0 && (
            <div className="px-2">
              <Plan isStreaming={isStreaming} defaultOpen>
                <PlanHeader>
                  <PlanTitle>Plan</PlanTitle>
                  <PlanTrigger />
                </PlanHeader>
                <PlanContent>
                  <ul className="space-y-1 text-xs">
                    {planEntries.map((entry, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">
                          {entry.status === 'completed' ? (
                            <CheckCircleIcon className="size-3.5 text-green-500" />
                          ) : entry.status === 'in_progress' ? (
                            <Loader2 className="size-3.5 animate-spin text-primary" />
                          ) : (
                            <ClockIcon className="size-3.5 text-muted-foreground" />
                          )}
                        </span>
                        <span className={entry.status === 'completed' ? 'text-muted-foreground line-through' : ''}>
                          {entry.content}
                        </span>
                        {entry.priority === 'high' && (
                          <span className="ml-auto shrink-0 rounded bg-red-500/15 px-1 text-[10px] text-red-400">high</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </PlanContent>
                <PlanFooter>
                  <span className="text-[10px] text-muted-foreground">
                    {planEntries.filter((e) => e.status === 'completed').length}/{planEntries.length} completed
                  </span>
                </PlanFooter>
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

      {/* Usage bar */}
      {usage && usage.size && usage.used != null && (
        <div className="flex items-center gap-2 border-t border-border/50 px-3 pt-2 text-[10px] text-muted-foreground">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span>Context: {Math.round((usage.used / usage.size) * 100)}%</span>
              <span>{(usage.used / 1000).toFixed(1)}k / {(usage.size / 1000).toFixed(0)}k tokens</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted">
              <div
                className={`h-1 rounded-full transition-all ${
                  usage.used / usage.size > 0.9 ? 'bg-red-500' :
                  usage.used / usage.size > 0.7 ? 'bg-yellow-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, (usage.used / usage.size) * 100)}%` }}
              />
            </div>
          </div>
          {usage.cost && (
            <span className="shrink-0 tabular-nums">
              {usage.cost.currency === 'USD' ? '$' : ''}{usage.cost.amount.toFixed(4)}
            </span>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-border/50 p-3 [&_[data-slot=input-group]]:items-stretch [&_[data-slot=input-group]]:!border-0 [&_[data-slot=input-group]]:!bg-transparent [&_[data-slot=input-group]]:dark:!bg-transparent [&_[data-slot=input-group]]:![box-shadow:none] [&_[data-slot=input-group]]:!ring-0 [&_textarea]:!py-1.5 [&_textarea]:!px-0 [&_textarea]:!ring-offset-0 [&_textarea]:!outline-none [&_[data-slot=input-group-addon]]:!px-0 [&_[data-slot=input-group-addon]]:!pb-0 [&_[data-slot=input-group-addon]]:!pt-0">
        <PromptInput
          onSubmit={handleSubmit}
          multiple
        >
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
              <div className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
                {filteredCommands.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    type="button"
                    className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-xs ${
                      i === commandIndex ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent/50'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectCommand(cmd.name);
                    }}
                  >
                    <span className="font-medium">/{cmd.name}</span>
                    {cmd.description && (
                      <span className="text-[10px] text-muted-foreground">{cmd.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <PromptInputTextarea
              className="min-h-10 pb-0"
              placeholder={
                chatStatus === 'error'
                  ? 'Session error'
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

              {/* Mode selector */}
              {initialModes && initialModes.availableModes.length > 1 && (
                <PromptInputSelect value={currentModeId} onValueChange={handleModeChange}>
                  <PromptInputSelectTrigger className="h-8 w-auto shrink-0 gap-1 px-2 text-xs whitespace-nowrap">
                    <PromptInputSelectValue />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {initialModes.availableModes.map((mode) => (
                      <SelectPrimitive.Item
                        key={mode.id}
                        value={mode.id}
                        className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          <SelectPrimitive.ItemIndicator>
                            <Check className="h-4 w-4" />
                          </SelectPrimitive.ItemIndicator>
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <SelectPrimitive.ItemText>{mode.name}</SelectPrimitive.ItemText>
                          {mode.description && (
                            <span className="text-[10px] text-muted-foreground">{mode.description}</span>
                          )}
                        </div>
                      </SelectPrimitive.Item>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}

              {/* Auto-approve toggle */}
              <PromptInputSelect
                value={autoApprove ? 'auto' : 'ask'}
                onValueChange={(val) => setAutoApprove(val === 'auto')}
              >
                <PromptInputSelectTrigger className="h-8 w-auto shrink-0 gap-1 px-2 text-xs whitespace-nowrap">
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  <PromptInputSelectItem value="ask">Ask for approval</PromptInputSelectItem>
                  <PromptInputSelectItem value="auto">Auto-approve</PromptInputSelectItem>
                </PromptInputSelectContent>
              </PromptInputSelect>

              {/* Config option selectors — only show when value matches an option */}
              {Array.from(configOptions.values())
                .filter((opt) => opt.type === 'enum' && opt.options && opt.options.length > 1 && opt.options.some((o) => o.value === opt.value))
                .map((opt) => (
                  <PromptInputSelect
                    key={opt.optionId}
                    value={opt.value}
                    onValueChange={(val) => {
                      window.electronAPI.acpSetConfigOption({ sessionKey, optionId: opt.optionId, value: val });
                      setConfigOptions((prev) => {
                        const next = new Map(prev);
                        next.set(opt.optionId, { ...opt, value: val });
                        return next;
                      });
                    }}
                  >
                    <PromptInputSelectTrigger className="h-8 w-auto shrink-0 gap-1 px-2 text-xs whitespace-nowrap" title={opt.description}>
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
  taskId,
  conversationId,
  providerId,
  cwd,
  autoApprove: autoApproveProp = false,
  onStatusChange,
  onAppendRef,
  onOpenAgentSettings,
  onCreateNewChat,
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
    modes,
    models,
    restartSession,
  } = useAcpSession({ conversationId, providerId, cwd });

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
    if (!transport && sessionKey) {
      onStatusChange?.('initializing', sessionKey);
    }
  }, [transport, sessionKey, onStatusChange]);

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

  // General session error with reconnect option
  if (sessionError && sessionError.message !== 'no_acp_support' && sessionError.message !== 'acp_unavailable') {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-3 p-6 text-center ${className}`}>
        <AlertCircle className="h-8 w-8 text-destructive" />
        <h3 className="text-sm font-semibold">Session Error</h3>
        <p className="max-w-md text-xs text-muted-foreground">{sessionError.message}</p>
        <Button variant="outline" size="sm" onClick={restartSession}>
          <RefreshCwIcon className="mr-1.5 h-3.5 w-3.5" />
          Reconnect
        </Button>
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
      providerId={providerId}
      transport={transport}
      initialMessages={initialMessages}
      sessionKey={sessionKey!}
      modes={modes}
      models={models}
      autoApproveInitial={autoApproveProp}
      onStatusChange={onStatusChange}
      onAppendRef={onAppendRef}
      onCreateNewChat={onCreateNewChat}
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
