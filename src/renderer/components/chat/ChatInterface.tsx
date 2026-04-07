import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Plus, X, MoreHorizontal, ArrowLeft, ArrowRight, Trash2, GitBranch, TerminalSquare, Pencil, Archive } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { toast, useToast } from '../../hooks/use-toast';
import { useConversationDots } from '../../hooks/useUnifiedStatus';
import { useTheme } from '../../hooks/useTheme';
import InstallBanner from '../agents/InstallBanner';
import { agentMeta } from '../../providers/meta';
import { agentConfig } from '../../lib/agentConfig';
import AgentDisplay from '../agents/AgentDisplay';
import { useInitialPromptInjection } from '../../hooks/useInitialPromptInjection';
import { openExternal } from '../../services/shellService';
import { ptyInput } from '../../services/ptyService';
import { onAgentSwitch } from '../../lib/agentSwitchStore';
import { useTaskComments } from '../../hooks/useLineComments';
import { type Agent } from '../../types';
import { Task } from '../../types/chat';
import { useTaskTerminals } from '@/lib/taskTerminalsStore';
import {
  getInstallCommandForProvider,
  getProvider,
  type ProviderId,
} from '@shared/providers/registry';
import { AcpChatPane } from './AcpChatPane';
import { TerminalPane } from '../TerminalPane';
import { unifiedStatusStore } from '../../lib/unifiedStatusStore';
import { useAutoScrollOnTaskSwitch } from '@/hooks/useAutoScrollOnTaskSwitch';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { getSettings } from '../../services/settingsService';
import { useAcpInitialPrompt } from '@/hooks/useAcpInitialPrompt';
import { useConversationManager } from '../../hooks/useConversationManager';
import { TaskScopeProvider } from '../project/TaskScopeContext';
import { CreateChatModal } from './CreateChatModal';
import { DeleteChatModal } from './DeleteChatModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { type Conversation } from '../../../main/services/DatabaseService';
import { terminalSessionRegistry } from '../../terminal/SessionRegistry';
import { getTaskEnvVars } from '@shared/task/envVars';

interface MultiViewProps {
  projectLabel: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
}

interface Props {
  task: Task;
  isActive?: boolean;
  projectName: string;
  projectPath?: string | null;
  projectRemoteConnectionId?: string | null;
  projectRemotePath?: string | null;
  defaultBranch?: string | null;
  className?: string;
  initialAgent?: Agent;
  multiView?: MultiViewProps;
  suppressTerminal?: boolean;
}

const ChatInterface: React.FC<Props> = ({
  task,
  isActive = true,
  projectName: _projectName,
  projectPath,
  projectRemoteConnectionId,
  projectRemotePath: _projectRemotePath,
  defaultBranch,
  className,
  initialAgent,
  multiView,
  suppressTerminal = false,
}) => {
  // Defer heavy IPC work until the task has been activated at least once.
  const [activated, setActivated] = useState(isActive);
  const [paneWidths, setPaneWidths] = useState<Record<string, number>>({});
  // Multi-view bottom terminal panel state
  const [mvTerminals, setMvTerminals] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [mvActiveTerminal, setMvActiveTerminal] = useState<Record<string, string>>({});
  const [mvTerminalHeight, setMvTerminalHeight] = useState<Record<string, number>>({});
  const [mvTerminalCloseTarget, setMvTerminalCloseTarget] = useState<{ convId: string; termId: string } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  if (isActive && !activated) setActivated(true);

  const { effectiveTheme } = useTheme();
  const multiViewDots = useConversationDots(multiView ? task.id : '');
  const { toast } = useToast();
  const [agent, setAgent] = useState<Agent>(initialAgent || 'claude');
  const initialAgentRef = useRef(initialAgent);
  initialAgentRef.current = initialAgent;
  const [cliStartFailed, setCliStartFailed] = useState(false);
  const { isAgentInstalled, setIsAgentInstalled, installedAgents } = useAgentStatus(
    agent,
    task.id,
    activated
  );

  // Ref to control terminal focus imperatively if needed
  const terminalRef = useRef<{ focus: () => void }>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // Conversation management (CRUD, loading, ordering)
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    conversationsLoaded,
    sortedConversations,
    showCreateChatModal,
    setShowCreateChatModal,
    showDeleteChatModal,
    setShowDeleteChatModal,
    handleCreateChat,
    handleCreateNewChat,
    handleResumeSession,
    handleSwitchChat,
    handleCloseChat,
    handleConfirmDeleteChat,
    handleCancelDeleteChat,
    handleClearChat,
    handleDeleteChatById,
    handleMoveChat,
    updateConversationTitle,
  } = useConversationManager({
    taskId: task.id,
    taskAgentId: task.agentId,
    activated,
    agent,
    setAgent,
    initialAgentRef,
    chatScrollContainerRef,
    toast,
  });

  // Update terminal ID to include conversation ID and agent - unique per conversation
  const terminalId = useMemo(() => {
    // Find the active conversation to check if it's the main one
    const activeConversation = conversations.find((c) => c.id === activeConversationId);

    if (activeConversation?.isMain) {
      // Main conversations use task-based ID for backward compatibility
      // This ensures terminal sessions persist correctly
      return `${agent}-main-${task.id}`;
    } else if (activeConversationId) {
      // Additional conversations use conversation-specific ID
      // Format: ${agent}-chat-${conversationId}
      return `${agent}-chat-${activeConversationId}`;
    }
    // Fallback to main format if no active conversation
    return `${agent}-main-${task.id}`;
  }, [activeConversationId, agent, task.id, conversations]);

  // Derive conversation mode from DB record (default to 'acp' for backward compatibility)
  const activeConversationMode = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConversationId);
    return conv?.mode === 'pty' ? 'pty' : 'acp';
  }, [conversations, activeConversationId]);

  // Report active view to main process for smart notification triggering
  useEffect(() => {
    if (!isActive) return;
    const sessionId = terminalId || activeConversationId || null;
    // Also update the unified status store for in-app toast suppression
    unifiedStatusStore.setActiveView(sessionId);
    window.electronAPI.setActiveHookView(sessionId, task.name);
    return () => {
      // Clear when this task is no longer active
      unifiedStatusStore.setActiveView(null);
      window.electronAPI.setActiveHookView(null);
    };
  }, [isActive, terminalId, activeConversationId, task.name, task.projectId]);

  // Claude needs consistent working directory to maintain session state
  const terminalCwd = useMemo(() => {
    return task.path || projectPath || undefined;
  }, [task.path, projectPath]);

  // Use a ref for defaultBranch to avoid taskEnv reference changes when
  // switching projects (defaultBranch toggles between a value and undefined
  // for non-selected projects, causing unnecessary TerminalPane detach/reattach).
  const defaultBranchRef = useRef(defaultBranch);
  defaultBranchRef.current = defaultBranch;

  const taskEnv = useMemo(() => {
    if (!projectPath) return undefined;
    return getTaskEnvVars({
      taskId: task.id,
      taskName: task.name,
      taskPath: task.path,
      projectPath,
      defaultBranch: defaultBranchRef.current || undefined,
    });
    // Intentionally exclude defaultBranch — stored in ref to prevent
    // env reference instability during project switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.name, task.path, projectPath]);

  // Provider CLI command overrides from settings
  const [providerOverrides, setProviderOverrides] = useState<
    Partial<Record<string, { defaultChatMode?: 'acp' | 'cli'; cliCommand?: string }>>
  >({});

  useEffect(() => {
    let cancelled = false;
    getSettings().then((settings) => {
      if (!cancelled && settings?.providerOverrides) {
        setProviderOverrides(settings.providerOverrides);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { activeTerminalId } = useTaskTerminals(task.id, task.path);

  // Line comments for agent context injection
  const { formatted: commentsContext } = useTaskComments(task.id);

  // Cleanup unified status store on task change / unmount
  useEffect(() => {
    return () => {
      unifiedStatusStore.removeTask(task.id);
    };
  }, [task.id]);

  // Auto-scroll to bottom when this task becomes active
  useAutoScrollOnTaskSwitch(isActive, task.id);

  // ACP initial prompt injection refs
  const acpAppendRef = useRef<((msg: { content: string }) => Promise<void>) | null>(null);
  const [acpChatStatus, setAcpChatStatus] = useState<string>('initializing');

  // Auto-focus terminal when switching to this task
  useEffect(() => {
    if (!isActive) return;
    // Small delay to ensure terminal is mounted and attached
    const timer = setTimeout(() => {
      const session = terminalSessionRegistry.getSession(terminalId);
      if (session) {
        session.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [task.id, terminalId, isActive]);

  // Focus terminal when this task becomes active (for already-mounted terminals)
  useEffect(() => {
    if (!isActive) return;
    // Small delay to ensure terminal is visible after tab switch
    const timer = setTimeout(() => {
      terminalRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [task.id, isActive]);

  useEffect(() => {
    const meta = agentMeta[agent];
    if (!meta?.terminalOnly || !meta.autoStartCommand) return;

    const onceKey = `cli:autoStart:${terminalId}`;
    try {
      if (localStorage.getItem(onceKey) === '1') return;
    } catch {}

    const send = () => {
      try {
        ptyInput(terminalId, `${meta.autoStartCommand}\n`);
        try {
          localStorage.setItem(onceKey, '1');
        } catch {}
      } catch {}
    };

    let off: (() => void) | null = null;
    try {
      off =
        window.electronAPI?.onPtyStarted?.((info: { id: string }) => {
          if (info?.id === terminalId) send();
        }) ?? null;
    } catch {}

    const t = setTimeout(send, 1200);

    return () => {
      try {
        off?.();
      } catch {}
      clearTimeout(t);
    };
  }, [agent, terminalId]);

  useEffect(() => {
    setCliStartFailed(false);
    setIsAgentInstalled(null);
  }, [task.id]);

  const runInstallCommand = useCallback(
    (cmd: string) => {
      const targetId = activeTerminalId;
      if (!targetId) return;

      const send = () => {
        try {
          ptyInput(targetId, `${cmd}\n`);
          return true;
        } catch (error) {
          console.error('Failed to run install command', error);
          toast({ title: 'Failed to run install command', variant: 'destructive' });
          return false;
        }
      };

      // Best effort immediate send
      const ok = send();

      // Listen for PTY start in case the terminal was still spinning up
      const off = window.electronAPI?.onPtyStarted?.((info: { id: string }) => {
        if (info?.id !== targetId) return;
        send();
        try {
          off?.();
        } catch {}
      });

      // If immediate send worked, remove listener
      if (ok) {
        try {
          off?.();
        } catch {}
      }
    },
    [activeTerminalId]
  );

  // Persist last-selected agent per task (including Droid)
  useEffect(() => {
    try {
      window.localStorage.setItem(`agent:last:${task.id}`, agent);
    } catch {}
    try {
      window.electronAPI?.setTaskAgent?.({ taskId: task.id, lastAgent: agent });
    } catch {}
  }, [agent, task.id]);

  // Track agent switching
  const prevAgentRef = React.useRef<Agent | null>(null);
  useEffect(() => {
    if (prevAgentRef.current && prevAgentRef.current !== agent) {
      void (async () => {
        const { captureTelemetry } = await import('../../lib/telemetryClient');
        captureTelemetry('task_agent_switched', { agent });
      })();
    }
    prevAgentRef.current = agent;
  }, [agent]);

  // Switch active chat/agent via global shortcuts (Cmd+Shift+J/K)
  useEffect(() => {
    return onAgentSwitch((direction) => {
      if (!isActive) return;
      if (conversations.length <= 1) return;

      const currentIndex = conversations.findIndex((c) => c.id === activeConversationId);
      if (currentIndex === -1) return;

      let newIndex: number;
      if (direction === 'prev') {
        newIndex = currentIndex <= 0 ? conversations.length - 1 : currentIndex - 1;
      } else {
        newIndex = (currentIndex + 1) % conversations.length;
      }

      const newConversation = conversations[newIndex];
      if (newConversation) {
        handleSwitchChat(newConversation.id);
      }
    });
  }, [isActive, conversations, activeConversationId, handleSwitchChat]);

  const isTerminal = agentMeta[agent]?.terminalOnly === true;
  const initialInjection = useMemo(() => {
    if (!isTerminal) return null;
    const md = task.metadata || null;
    const p = (md?.initialPrompt || '').trim();
    if (p) {
      if (commentsContext) {
        return `The user has left the following comments on the code changes:\n\n${commentsContext}\n\n${p}`;
      }
      return p;
    }

    // If we have comments but no other context, return just the comments
    if (commentsContext) {
      return `The user has left the following comments on the code changes:\n\n${commentsContext}`;
    }

    return null;
  }, [isTerminal, task.metadata, commentsContext]);

  // Register hook session IDs in UI tab order once conversations load,
  // so per-conversation dots match the chat tabs. The main session ID
  // is auto-parsed from hook events (no registration needed for it to work),
  // but explicit registration is needed for ordered multi-chat pill display.
  useEffect(() => {
    if (!isTerminal || agent !== 'claude' || conversations.length === 0) return;
    const sessionIds = conversations.map((conv) =>
      conv.isMain ? `${agent}-main-${task.id}` : `${agent}-chat-${conv.id}`
    );
    unifiedStatusStore.registerHookSessions(sessionIds, task.id);
    return () => {
      for (const sid of sessionIds) {
        unifiedStatusStore.unregisterHookSession(sid);
      }
    };
  }, [isTerminal, agent, task.id, conversations]);

  // Only use keystroke injection for agents WITHOUT CLI flag support
  // Agents with initialPromptFlag use CLI arg injection via TerminalPane instead
  useInitialPromptInjection({
    taskId: task.id,
    providerId: agent,
    prompt: initialInjection,
    enabled: isTerminal && agentMeta[agent]?.initialPromptFlag === undefined,
  });

  // ACP initial prompt injection — sends task context as first message
  useAcpInitialPrompt({
    taskId: task.id,
    providerId: agent,
    prompt: initialInjection,
    appendFn: acpAppendRef.current,
    chatStatus: acpChatStatus,
    enabled: activeConversationMode === 'acp',
  });

  // Ensure an agent is stored for this task so fallbacks can subscribe immediately
  useEffect(() => {
    try {
      localStorage.setItem(`taskAgent:${task.id}`, agent);
    } catch {}
  }, [agent, task.id]);

  if (!isTerminal) {
    return null;
  }

  return (
    <TaskScopeProvider value={{ taskId: task.id, taskPath: task.path }}>
      <div
        className={`flex h-full flex-col ${effectiveTheme === 'dark-black' ? 'bg-black' : 'bg-card'} ${multiView ? 'flex-1' : ''} ${className}`}
      >
        <CreateChatModal
          isOpen={showCreateChatModal}
          onClose={() => setShowCreateChatModal(false)}
          onCreateChat={handleCreateChat}
          installedAgents={installedAgents}
          existingConversations={conversations}
        />

        <DeleteChatModal
          open={showDeleteChatModal}
          onOpenChange={setShowDeleteChatModal}
          onConfirm={handleConfirmDeleteChat}
          onCancel={handleCancelDeleteChat}
        />

        {/* Confirm terminal close */}
        <AlertDialog
          open={!!mvTerminalCloseTarget}
          onOpenChange={(open) => { if (!open) setMvTerminalCloseTarget(null); }}
        >
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Close Terminal?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription className="text-sm">
              This terminal may have a running process. Closing it will terminate the process.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (mvTerminalCloseTarget) {
                    const { convId, termId } = mvTerminalCloseTarget;
                    terminalSessionRegistry.dispose(termId);
                    setMvTerminals((prev) => {
                      const remaining = (prev[convId] || []).filter((t) => t.id !== termId);
                      if (remaining.length === 0) {
                        setMvTerminalHeight((p) => ({ ...p, [convId]: 0 }));
                        setMvActiveTerminal((p) => { const n = { ...p }; delete n[convId]; return n; });
                      } else if ((mvActiveTerminal[convId] || '') === termId) {
                        setMvActiveTerminal((p) => ({ ...p, [convId]: remaining[remaining.length - 1].id }));
                      }
                      return { ...prev, [convId]: remaining };
                    });
                  }
                  setMvTerminalCloseTarget(null);
                }}
              >
                Close Terminal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex min-h-0 flex-1 flex-col">
          {(() => {
            if (isAgentInstalled === false) {
              return (
                <InstallBanner
                  agent={agent}
                  terminalId={terminalId}
                  installCommand={getInstallCommandForProvider(agent)}
                  onRunInstall={runInstallCommand}
                  onOpenExternal={openExternal}
                />
              );
            }
            if (cliStartFailed) {
              return (
                <InstallBanner
                  agent={agent}
                  terminalId={terminalId}
                  onRunInstall={runInstallCommand}
                  onOpenExternal={openExternal}
                />
              );
            }
            return null;
          })()}
          <div
            ref={chatScrollContainerRef}
            className={`flex min-h-0 flex-1 ${multiView ? 'gap-2' : 'gap-3 overflow-x-auto p-2'}`}
          >
            {conversationsLoaded &&
              sortedConversations.map((conv, idx) => {
                const convAgent = conv.provider || agent;
                const agentBg =
                  convAgent === 'charm'
                    ? effectiveTheme === 'dark-black'
                      ? 'bg-black'
                      : effectiveTheme === 'dark'
                        ? 'bg-card'
                        : 'bg-white'
                    : convAgent === 'mistral'
                      ? effectiveTheme === 'dark' || effectiveTheme === 'dark-black'
                        ? effectiveTheme === 'dark-black'
                          ? 'bg-[#141820]'
                          : 'bg-[#202938]'
                        : 'bg-white'
                      : '';
                return (
                  <div
                    key={conv.id}
                    data-mv-pane
                    className={`border-border/50 relative min-w-[520px] flex-1 overflow-hidden rounded-lg border ${agentBg}`}
                    style={multiView && paneWidths[conv.id] ? { flexBasis: paneWidths[conv.id], flexGrow: 0, flexShrink: 0 } : undefined}
                    onClick={() => setActiveConversationId(conv.id)}
                  >
                    <div className="flex h-full flex-col">
                    {conv.mode === 'pty' ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        {/* Per-pane toolbar — drag handle for reordering in multi-view */}
                        <div
                          className={`border-border/50 flex shrink-0 items-center justify-between border-b px-4 py-2.5 ${multiView?.onDragStart ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          onPointerDown={multiView?.onDragStart}
                        >
                          {/* Left: project badge (multi-view) + agent logo + name */}
                          <div className="text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 px-1 text-xs">
                            {multiView && (
                              <>
                                {(() => {
                                  const dot = multiViewDots[0] || {
                                    color: 'green',
                                    style: 'solid',
                                  };
                                  const bg: Record<string, string> = {
                                    green: 'bg-green-500',
                                    amber: 'bg-amber-500',
                                    red: 'bg-red-500',
                                    gray: 'bg-gray-400',
                                  };
                                  return (
                                    <span
                                      className={`h-2 w-2 flex-shrink-0 rounded-full ${bg[dot.color] || 'bg-green-500'} ${dot.style === 'pulsing' ? 'animate-pulse' : ''}`}
                                    />
                                  );
                                })()}
                                <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium">
                                  {multiView.projectLabel}
                                </span>
                                {isRenaming && multiView.onRename ? (
                                  <input
                                    autoFocus
                                    className="bg-transparent text-sm font-medium outline-none border-b border-accent w-32"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && renameValue.trim()) {
                                        multiView.onRename!(renameValue.trim());
                                        setIsRenaming(false);
                                      }
                                      if (e.key === 'Escape') {
                                        setIsRenaming(false);
                                      }
                                    }}
                                    onBlur={() => setIsRenaming(false)}
                                  />
                                ) : (
                                  <span className="text-foreground text-xs font-medium">
                                    {task.name}
                                  </span>
                                )}
                                {task.useWorktree !== false && (
                                  <span title="Running in worktree">
                                    <GitBranch className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                                  </span>
                                )}
                                <span className="text-border">|</span>
                              </>
                            )}
                            {agentConfig[convAgent as Agent] && (
                              <img
                                src={agentConfig[convAgent as Agent].logo}
                                alt={agentConfig[convAgent as Agent].alt}
                                className={`size-3.5 rounded-sm ${agentConfig[convAgent as Agent].invertInDark ? 'dark:invert' : ''}`}
                              />
                            )}
                            <span>
                              {conv.title || agentConfig[convAgent as Agent]?.name || convAgent}
                            </span>
                          </div>
                          {/* Right: action buttons */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={handleCreateNewChat}
                              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                              title="New Chat"
                            >
                              <Plus className="size-3.5" />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                                  title="More"
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => handleMoveChat(conv.id, 'right')}
                                  disabled={idx >= sortedConversations.length - 1}
                                >
                                  <ArrowRight className="size-4" />
                                  Move Right
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleMoveChat(conv.id, 'left')}
                                  disabled={idx <= 0}
                                >
                                  <ArrowLeft className="size-4" />
                                  Move Left
                                </DropdownMenuItem>
                                {conversations.length > 1 && (
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteChatById(conv.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="size-4" />
                                    Delete Chat
                                  </DropdownMenuItem>
                                )}
                                {multiView && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {multiView.onRename && (
                                      <DropdownMenuItem onClick={() => {
                                        setRenameValue(task.name);
                                        setIsRenaming(true);
                                      }}>
                                        <Pencil className="size-4" />
                                        Rename Session
                                      </DropdownMenuItem>
                                    )}
                                    {multiView.onArchive && (
                                      <DropdownMenuItem onClick={multiView.onArchive}>
                                        <Archive className="size-4" />
                                        Archive Session
                                      </DropdownMenuItem>
                                    )}
                                    {multiView.onDelete && (
                                      <DropdownMenuItem onClick={multiView.onDelete} className="text-destructive focus:text-destructive">
                                        <Trash2 className="size-4" />
                                        Delete Session
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={multiView.onMoveLeft}
                                      disabled={!multiView.canMoveLeft}
                                    >
                                      <ArrowLeft className="size-4" />
                                      Move Pane Left
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={multiView.onMoveRight}
                                      disabled={!multiView.canMoveRight}
                                    >
                                      <ArrowRight className="size-4" />
                                      Move Pane Right
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={multiView.onRemove}
                                      className="text-destructive"
                                    >
                                      <X className="size-4" />
                                      Remove from Multi-View
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        {!suppressTerminal && (
                          <TerminalPane
                            id={
                              conv.isMain
                                ? `${convAgent}-main-${task.id}`
                                : `${convAgent}-chat-${conv.id}`
                            }
                            cwd={terminalCwd || task.path || '.'}
                            {...(providerOverrides[convAgent]?.cliCommand
                              ? { shell: providerOverrides[convAgent]!.cliCommand }
                              : { providerId: convAgent })}
                            env={taskEnv}
                            keepAlive
                            autoApprove={!!task.metadata?.autoApprove}
                            className="min-h-0 flex-1"
                            claudeSessionId={
                              convAgent === 'claude'
                                ? (() => {
                                    try {
                                      const meta = conv.metadata ? JSON.parse(conv.metadata) : {};
                                      return meta.claudeSessionId as string | undefined;
                                    } catch {
                                      return undefined;
                                    }
                                  })()
                                : undefined
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <AcpChatPane
                        taskId={task.id}
                        conversationId={conv.id}
                        providerId={convAgent}
                        cwd={terminalCwd || task.path || '.'}
                        projectPath={projectPath || undefined}
                        isActive={isActive}
                        conversationTitle={conv.title}
                        onConversationTitleChange={(title) =>
                          updateConversationTitle(conv.id, title)
                        }
                        onStatusChange={(status) => {
                          try {
                            window.localStorage.setItem(`agent:locked:${task.id}`, convAgent);
                          } catch {}
                          try {
                            window.electronAPI?.setTaskAgent?.({
                              taskId: task.id,
                              lockedAgent: convAgent,
                            });
                          } catch {}
                          if (conv.id === activeConversationId) {
                            setAcpChatStatus(status);
                          }
                        }}
                        onAppendRef={
                          conv.id === activeConversationId
                            ? (fn) => {
                                acpAppendRef.current = fn;
                              }
                            : undefined
                        }
                        onCreateNewChat={handleCreateNewChat}
                        onResumeSession={handleResumeSession}
                        onClearChat={() => handleClearChat(conv.id)}
                        onDeleteChat={() => handleDeleteChatById(conv.id)}
                        onMoveLeft={() => handleMoveChat(conv.id, 'left')}
                        onMoveRight={() => handleMoveChat(conv.id, 'right')}
                        canMoveLeft={idx > 0}
                        canMoveRight={idx < sortedConversations.length - 1}
                        className="min-h-0 flex-1"
                      />
                    )}

                    {/* Bottom terminal panel (multi-view only) */}
                    {multiView && (() => {
                      const tabs = mvTerminals[conv.id] || [];
                      const activeTab = mvActiveTerminal[conv.id] || '';
                      const panelHeight = mvTerminalHeight[conv.id] || 0;

                      const addTerminal = () => {
                        const idx = tabs.length + 1;
                        const newId = `shell-mv-${conv.id}-${Date.now()}`;
                        const newTab = { id: newId, label: `Terminal${idx > 1 ? ` ${idx}` : ''}` };
                        setMvTerminals((prev) => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newTab] }));
                        setMvActiveTerminal((prev) => ({ ...prev, [conv.id]: newId }));
                        if (!panelHeight) {
                          setMvTerminalHeight((prev) => ({ ...prev, [conv.id]: 200 }));
                        }
                      };

                      const closeTerminal = (termId: string) => {
                        terminalSessionRegistry.dispose(termId);
                        setMvTerminals((prev) => {
                          const remaining = (prev[conv.id] || []).filter((t) => t.id !== termId);
                          if (remaining.length === 0) {
                            setMvTerminalHeight((p) => ({ ...p, [conv.id]: 0 }));
                            setMvActiveTerminal((p) => { const n = { ...p }; delete n[conv.id]; return n; });
                          } else if (activeTab === termId) {
                            setMvActiveTerminal((p) => ({ ...p, [conv.id]: remaining[remaining.length - 1].id }));
                          }
                          return { ...prev, [conv.id]: remaining };
                        });
                      };

                      const handleCloseClick = async (termId: string) => {
                        try {
                          const result = await window.electronAPI.ptyHasChildProcess(termId);
                          if (result.ok && result.hasChild) {
                            setMvTerminalCloseTarget({ convId: conv.id, termId });
                            return;
                          }
                        } catch {
                          // If check fails, close without confirmation
                        }
                        closeTerminal(termId);
                      };

                      return (
                        <>
                          {/* Drag handle — always visible */}
                          <div
                            className="border-border/30 group flex h-3 shrink-0 cursor-row-resize items-center justify-center border-t transition-colors hover:bg-accent/50"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const startY = e.clientY;
                              const paneEl = e.currentTarget.closest('[data-mv-pane]') as HTMLElement | null;
                              if (!paneEl) return;
                              const paneRect = paneEl.getBoundingClientRect();
                              const currentH = panelHeight;
                              const onMove = (ev: MouseEvent) => {
                                const delta = startY - ev.clientY;
                                const newH = Math.max(0, currentH + delta);
                                const clamped = Math.min(newH, paneRect.height * 0.6);
                                setMvTerminalHeight((prev) => ({
                                  ...prev,
                                  [conv.id]: clamped < 60 ? 0 : clamped,
                                }));
                              };
                              const onUp = () => {
                                document.removeEventListener('mousemove', onMove);
                                document.removeEventListener('mouseup', onUp);
                              };
                              document.addEventListener('mousemove', onMove);
                              document.addEventListener('mouseup', onUp);
                            }}
                            onDoubleClick={() => {
                              if (tabs.length === 0) {
                                addTerminal();
                              } else {
                                setMvTerminalHeight((prev) => ({
                                  ...prev,
                                  [conv.id]: prev[conv.id] ? 0 : 200,
                                }));
                              }
                            }}
                          >
                            <span className="bg-muted-foreground/30 group-hover:bg-muted-foreground/60 h-[2px] w-8 rounded-full transition-colors" />
                          </div>

                          {/* Tab bar — always visible when terminals exist */}
                          {tabs.length > 0 && (
                            <div className="border-border/30 flex shrink-0 items-center gap-1 border-t px-2 py-1">
                              {tabs.map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => {
                                    setMvActiveTerminal((prev) => ({ ...prev, [conv.id]: tab.id }));
                                    if (!panelHeight) setMvTerminalHeight((prev) => ({ ...prev, [conv.id]: 200 }));
                                  }}
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                    activeTab === tab.id
                                      ? 'bg-accent text-accent-foreground'
                                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                                  }`}
                                >
                                  <TerminalSquare className="h-3 w-3" />
                                  {tab.label}
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); handleCloseClick(tab.id); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleCloseClick(tab.id); } }}
                                    className="text-muted-foreground hover:text-foreground hover:bg-muted -mr-0.5 rounded p-0.5 transition-colors"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </span>
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={addTerminal}
                                className="text-muted-foreground hover:bg-accent/50 hover:text-foreground inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                                title="New Terminal"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {/* Terminal content — only when panel is open */}
                          {tabs.length > 0 && panelHeight > 0 && (
                            <div className="shrink-0 overflow-hidden" style={{ height: panelHeight }}>
                              {tabs.map((tab) => (
                                <div
                                  key={tab.id}
                                  className="h-full w-full"
                                  style={{ display: activeTab === tab.id ? 'block' : 'none' }}
                                >
                                  <TerminalPane
                                    id={tab.id}
                                    cwd={terminalCwd || task.path || '.'}
                                    keepAlive={false}
                                    className="h-full w-full"
                                    disableSnapshots
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                    </div>
                    {/* Resize handle — drag to resize, double-click to reset */}
                    <div
                      className="bg-border/0 hover:bg-border active:bg-ring absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const startX = e.clientX;
                        const paneEl = e.currentTarget.parentElement;
                        if (!paneEl) return;
                        const startWidth = paneEl.getBoundingClientRect().width;
                        // Find the scrollable ancestor for auto-scroll during drag
                        const scrollContainer = paneEl.closest(
                          '.overflow-x-auto'
                        ) as HTMLElement | null;
                        const onMove = (ev: MouseEvent) => {
                          const newWidth = Math.max(520, startWidth + ev.clientX - startX);
                          setPaneWidths((prev) => ({ ...prev, [conv.id]: newWidth }));
                          // Auto-scroll when dragging near the right edge
                          if (scrollContainer) {
                            const rect = scrollContainer.getBoundingClientRect();
                            const edgeZone = 60;
                            if (ev.clientX > rect.right - edgeZone) {
                              scrollContainer.scrollLeft += ev.clientX - (rect.right - edgeZone);
                            }
                          }
                        };
                        const onUp = () => {
                          document.removeEventListener('mousemove', onMove);
                          document.removeEventListener('mouseup', onUp);
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                      }}
                      onDoubleClick={() => {
                        setPaneWidths((prev) => {
                          const next = { ...prev };
                          delete next[conv.id];
                          return next;
                        });
                      }}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </TaskScopeProvider>
  );
};

export default ChatInterface;
