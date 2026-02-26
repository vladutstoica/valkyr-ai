import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { toast, useToast } from '../hooks/use-toast';
import { useTheme } from '../hooks/useTheme';
import InstallBanner from './InstallBanner';
import { agentMeta } from '../providers/meta';
import { agentConfig } from '../lib/agentConfig';
import AgentDisplay from './AgentDisplay';
import { useInitialPromptInjection } from '../hooks/useInitialPromptInjection';
import { useTaskComments } from '../hooks/useLineComments';
import { type Agent } from '../types';
import { Task } from '../types/chat';
import { useTaskTerminals } from '@/lib/taskTerminalsStore';
import { getInstallCommandForProvider, getProvider } from '@shared/providers/registry';
import { AcpChatPane } from './AcpChatPane';
import { unifiedStatusStore } from '../lib/unifiedStatusStore';
import { useAutoScrollOnTaskSwitch } from '@/hooks/useAutoScrollOnTaskSwitch';
import { useAcpInitialPrompt } from '@/hooks/useAcpInitialPrompt';
import { TaskScopeProvider } from './TaskScopeContext';
import { CreateChatModal } from './CreateChatModal';
import { DeleteChatModal } from './DeleteChatModal';
import { type Conversation } from '../../main/services/DatabaseService';
import { terminalSessionRegistry } from '../terminal/SessionRegistry';
import { getTaskEnvVars } from '@shared/task/envVars';

declare const window: Window & {
  electronAPI: {
    saveMessage: (message: any) => Promise<{ success: boolean; error?: string }>;
  };
};

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
}) => {
  // Defer heavy IPC work until the task has been activated at least once.
  const [activated, setActivated] = useState(isActive);
  if (isActive && !activated) setActivated(true);

  const { effectiveTheme } = useTheme();
  const { toast } = useToast();
  const [isAgentInstalled, setIsAgentInstalled] = useState<boolean | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<
    Record<string, { installed?: boolean; path?: string | null; version?: string | null }>
  >({});
  const [agent, setAgent] = useState<Agent>(initialAgent || 'claude');
  const initialAgentRef = useRef(initialAgent);
  initialAgentRef.current = initialAgent;
  const currentAgentStatus = agentStatuses[agent];
  const [cliStartFailed, setCliStartFailed] = useState(false);

  // Multi-chat state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [showCreateChatModal, setShowCreateChatModal] = useState(false);
  const [showDeleteChatModal, setShowDeleteChatModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

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

  // All agent conversations use ACP mode
  const activeConversationMode = 'acp' as const;

  // Claude needs consistent working directory to maintain session state
  const terminalCwd = useMemo(() => {
    return task.path || projectPath || undefined;
  }, [task.path, projectPath]);

  const taskEnv = useMemo(() => {
    if (!projectPath) return undefined;
    return getTaskEnvVars({
      taskId: task.id,
      taskName: task.name,
      taskPath: task.path,
      projectPath,
      defaultBranch: defaultBranch || undefined,
    });
  }, [task.id, task.name, task.path, projectPath, defaultBranch]);

  const installedAgents = useMemo(
    () =>
      Object.entries(agentStatuses)
        .filter(([, status]) => status.installed === true)
        .map(([id]) => id),
    [agentStatuses]
  );

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

  // Load conversations when task changes (deferred until first activation)
  useEffect(() => {
    if (!activated) return;
    const loadConversations = async () => {
      setConversationsLoaded(false);
      const result = await window.electronAPI.getConversations(task.id);

      if (result.success && result.conversations && result.conversations.length > 0) {
        const convs = result.conversations;
        setConversations(convs);

        // Preserve the current active conversation if it still exists in the result
        // (prevents resetting when this effect re-fires, e.g. on task.agentId change)
        let chosen: Conversation | undefined;
        setActiveConversationId((prev) => {
          if (prev && convs.some((c: Conversation) => c.id === prev)) {
            chosen = convs.find((c: Conversation) => c.id === prev);
            return prev; // keep current selection
          }
          // Otherwise pick the DB-active or first conversation
          const active = convs.find((c: Conversation) => c.isActive);
          chosen = active || convs[0]!;
          if (!active && chosen) {
            window.electronAPI.setActiveConversation({
              taskId: task.id,
              conversationId: chosen.id,
            });
          }
          return chosen?.id ?? null;
        });

        // Update agent: prefer conversation provider, then localStorage, then defaults
        if (chosen?.provider) {
          setAgent(chosen.provider as Agent);
        } else {
          // Fallback to localStorage
          try {
            const lastKey = `agent:last:${task.id}`;
            const last = window.localStorage.getItem(lastKey) as Agent | null;
            if (initialAgentRef.current) {
              setAgent(initialAgentRef.current);
            } else if (last) {
              setAgent(last);
            } else {
              setAgent('codex');
            }
          } catch {
            setAgent(initialAgentRef.current || 'codex');
          }
        }
        setConversationsLoaded(true);
      } else {
        // No conversations exist - create default for backward compatibility
        // This ensures existing tasks always have at least one conversation
        // (preserves pre-multi-chat behavior)
        const defaultResult = await window.electronAPI.getOrCreateDefaultConversation(task.id);
        if (defaultResult.success && defaultResult.conversation) {
          // For backward compatibility: use task.agentId if available, otherwise use current agent
          // This preserves the original agent choice for tasks created before multi-chat
          const taskAgent = task.agentId || agent;
          const conversationWithAgent = {
            ...defaultResult.conversation,
            provider: taskAgent,
            isMain: true,
          };
          setConversations([conversationWithAgent]);
          setActiveConversationId(defaultResult.conversation.id);

          // Update the agent state to match
          setAgent(taskAgent as Agent);

          // Save the agent to the conversation
          await window.electronAPI.saveConversation(conversationWithAgent);
          setConversationsLoaded(true);
        }
      }
    };

    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.agentId, activated]); // initialAgent accessed via ref to avoid re-triggering on isActive changes

  // ACP initial prompt injection refs
  const acpAppendRef = useRef<((msg: { content: string }) => Promise<void>) | null>(null);
  const [acpChatStatus, setAcpChatStatus] = useState<string>('initializing');

  // Ref to control terminal focus imperatively if needed
  const terminalRef = useRef<{ focus: () => void }>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

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
        (window as any).electronAPI?.ptyInput?.({
          id: terminalId,
          data: `${meta.autoStartCommand}\n`,
        });
        try {
          localStorage.setItem(onceKey, '1');
        } catch {}
      } catch {}
    };

    const api: any = (window as any).electronAPI;
    let off: (() => void) | null = null;
    try {
      off = api?.onPtyStarted?.((info: { id: string }) => {
        if (info?.id === terminalId) send();
      });
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
      const api: any = (window as any).electronAPI;
      const targetId = activeTerminalId;
      if (!targetId) return;

      const send = () => {
        try {
          api?.ptyInput?.({ id: targetId, data: `${cmd}\n` });
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
      const off = api?.onPtyStarted?.((info: { id: string }) => {
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

  // Chat management handlers
  const handleCreateChat = useCallback(
    async (title: string, newAgent: string) => {
      try {
        // Don't dispose the current terminal - each chat has its own independent session

        const result = await window.electronAPI.createConversation({
          taskId: task.id,
          title,
          provider: newAgent,
          isMain: false, // Additional chats are never main
        });

        if (result.success && result.conversation) {
          // Reload conversations
          const conversationsResult = await window.electronAPI.getConversations(task.id);
          if (conversationsResult.success) {
            setConversations(conversationsResult.conversations || []);
          }
          setActiveConversationId(result.conversation.id);
          setAgent(newAgent as Agent);
          // Scroll to the newly created chat pane
          requestAnimationFrame(() => {
            chatScrollContainerRef.current?.scrollTo({
              left: chatScrollContainerRef.current.scrollWidth,
              behavior: 'smooth',
            });
          });
        } else {
          console.error('Failed to create conversation:', result.error);
          toast({
            title: 'Error',
            description: result.error || 'Failed to create chat',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Exception creating conversation:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to create chat',
          variant: 'destructive',
        });
      }
    },
    [task.id, toast]
  );

  const handleCreateNewChat = useCallback(async () => {
    const config = agentConfig[agent as Agent];
    const title = config?.name || agent;
    await handleCreateChat(title, agent);
  }, [agent, handleCreateChat]);

  const handleResumeSession = useCallback(
    async (acpSessionId: string, title?: string) => {
      try {
        const config = agentConfig[agent as Agent];
        const chatTitle = title || `Resumed: ${config?.name || agent}`;

        const result = await window.electronAPI.createConversation({
          taskId: task.id,
          title: chatTitle,
          provider: agent,
          isMain: false,
        });

        if (result.success && result.conversation) {
          await window.electronAPI.updateConversationAcpSessionId({
            conversationId: result.conversation.id,
            acpSessionId,
          });

          const conversationsResult = await window.electronAPI.getConversations(task.id);
          if (conversationsResult.success) {
            setConversations(conversationsResult.conversations || []);
          }
          setActiveConversationId(result.conversation.id);
        }
      } catch (error) {
        console.error('Failed to resume session:', error);
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to resume session',
          variant: 'destructive',
        });
      }
    },
    [agent, task.id, toast]
  );

  const handleSwitchChat = useCallback(
    async (conversationId: string) => {
      // Don't dispose terminals - just switch between them
      // Each chat maintains its own persistent terminal session

      await window.electronAPI.setActiveConversation({
        taskId: task.id,
        conversationId,
      });
      setActiveConversationId(conversationId);

      // Use functional updater to read latest conversations state
      setConversations((prev) => {
        const conv = prev.find((c) => c.id === conversationId);
        if (conv?.provider) setAgent(conv.provider as Agent);
        return prev; // Don't modify, just read
      });
    },
    [task.id]
  );

  const handleCloseChat = useCallback(
    (conversationId: string) => {
      if (conversations.length <= 1) {
        toast({
          title: 'Cannot Close',
          description: 'Cannot close the last chat',
          variant: 'destructive',
        });
        return;
      }

      // Show the delete confirmation modal
      setChatToDelete(conversationId);
      setShowDeleteChatModal(true);
    },
    [conversations.length, toast]
  );

  const handleConfirmDeleteChat = useCallback(async () => {
    if (!chatToDelete) return;

    // Only dispose the terminal when actually deleting the chat
    // Find the conversation to get its provider
    const convToDelete = conversations.find((c) => c.id === chatToDelete);
    const convAgent = convToDelete?.provider || agent;
    const terminalToDispose = `${convAgent}-chat-${chatToDelete}`;
    terminalSessionRegistry.dispose(terminalToDispose);

    // Kill the ACP session process if one exists for this conversation
    const acpSessionKey = `${convAgent}-acp-${chatToDelete}`;
    window.electronAPI.acpKill({ sessionKey: acpSessionKey }).catch(() => {});

    await window.electronAPI.deleteConversation(chatToDelete);

    // Reload conversations
    const result = await window.electronAPI.getConversations(task.id);
    if (result.success) {
      setConversations(result.conversations || []);
      // Switch to another chat if we deleted the active one
      if (
        chatToDelete === activeConversationId &&
        result.conversations &&
        result.conversations.length > 0
      ) {
        const newActive = result.conversations[0];
        await window.electronAPI.setActiveConversation({
          taskId: task.id,
          conversationId: newActive.id,
        });
        setActiveConversationId(newActive.id);
        // Update provider if needed
        if (newActive.provider) {
          setAgent(newActive.provider as Agent);
        }
      }
    }

    // Clear the state
    setChatToDelete(null);
    setShowDeleteChatModal(false);
  }, [chatToDelete, conversations, agent, task.id, activeConversationId]);

  const handleClearChat = useCallback(
    (conversationId: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      const convAgent = conv?.provider || agent;
      const config = agentConfig[convAgent as Agent];
      const title = config?.name || convAgent;
      (async () => {
        const terminalToDispose = `${convAgent}-chat-${conversationId}`;
        terminalSessionRegistry.dispose(terminalToDispose);
        // Kill the ACP session process if one exists for this conversation
        const acpSessionKey = `${convAgent}-acp-${conversationId}`;
        window.electronAPI.acpKill({ sessionKey: acpSessionKey }).catch(() => {});
        await window.electronAPI.deleteConversation(conversationId);
        await handleCreateChat(title, convAgent);
      })();
    },
    [agent, conversations, handleCreateChat]
  );

  const handleDeleteChatById = useCallback(
    (conversationId: string) => {
      handleCloseChat(conversationId);
    },
    [handleCloseChat]
  );

  const handleMoveChat = useCallback(
    async (conversationId: string, direction: 'left' | 'right') => {
      const sorted = [...conversations].sort((a, b) => {
        if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
          return a.displayOrder - b.displayOrder;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      const idx = sorted.findIndex((c) => c.id === conversationId);
      if (idx < 0) return;
      const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const newOrder = sorted.map((c) => c.id);
      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
      await window.electronAPI.reorderConversations({ taskId: task.id, conversationIds: newOrder });
      const result = await window.electronAPI.getConversations(task.id);
      if (result.success) {
        setConversations(result.conversations || []);
      }
    },
    [conversations, task.id]
  );

  // Helper to compute sorted conversations (used for rendering and move logic)
  const sortedConversations = React.useMemo(
    () =>
      [...conversations].sort((a, b) => {
        if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
          return a.displayOrder - b.displayOrder;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [conversations]
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
        const { captureTelemetry } = await import('../lib/telemetryClient');
        captureTelemetry('task_agent_switched', { agent });
      })();
    }
    prevAgentRef.current = agent;
  }, [agent]);

  useEffect(() => {
    const installed = currentAgentStatus?.installed === true;
    setIsAgentInstalled(installed);
  }, [agent, currentAgentStatus]);

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;
    let refreshCheckRequested = false;
    const api: any = (window as any).electronAPI;

    const applyStatuses = (statuses: Record<string, any> | undefined | null) => {
      if (!statuses) return;
      setAgentStatuses(statuses);
      if (cancelled) return;
      const installed = statuses?.[agent]?.installed === true;
      setIsAgentInstalled(installed);
    };

    const maybeRefreshAgentStatus = async (statuses?: Record<string, any> | undefined | null) => {
      if (cancelled || refreshCheckRequested) return;
      if (!api?.getProviderStatuses) return;

      const status = statuses?.[agent];
      const hasEntry = Boolean(status);
      const isInstalled = status?.installed === true;
      const lastChecked =
        typeof status?.lastChecked === 'number' && Number.isFinite(status.lastChecked)
          ? status.lastChecked
          : 0;
      const isStale = !lastChecked || Date.now() - lastChecked > 5 * 60 * 1000;

      if (hasEntry && isInstalled && !isStale) return;

      refreshCheckRequested = true;
      try {
        const refreshed = await api.getProviderStatuses({ refresh: true, providers: [agent] });
        if (cancelled) return;
        if (refreshed?.success) {
          applyStatuses(refreshed.statuses ?? {});
        }
      } catch (error) {
        console.error('Agent status refresh failed', error);
      }
    };

    const load = async () => {
      if (!api?.getProviderStatuses) {
        setIsAgentInstalled(false);
        return;
      }
      try {
        const res = await api.getProviderStatuses();
        if (cancelled) return;
        if (res?.success) {
          applyStatuses(res.statuses ?? {});
          void maybeRefreshAgentStatus(res.statuses);
        } else {
          setIsAgentInstalled(false);
        }
      } catch (error) {
        if (!cancelled) setIsAgentInstalled(false);
        console.error('Agent status load failed', error);
      }
    };

    const off =
      api?.onProviderStatusUpdated?.((payload: { providerId: string; status: any }) => {
        if (!payload?.providerId) return;
        setAgentStatuses((prev) => {
          const next = { ...prev, [payload.providerId]: payload.status };
          return next;
        });
        if (payload.providerId === agent) {
          setIsAgentInstalled(payload.status?.installed === true);
        }
      }) || null;

    void load();

    return () => {
      cancelled = true;
      off?.();
    };
  }, [agent, task.id, activated]);

  // Switch active chat/agent via global shortcuts (Cmd+Shift+J/K)
  useEffect(() => {
    const handleAgentSwitch = (event: Event) => {
      if (!isActive) return;
      const customEvent = event as CustomEvent<{ direction: 'next' | 'prev' }>;
      if (conversations.length <= 1) return;
      const direction = customEvent.detail?.direction;
      if (!direction) return;

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
    };

    window.addEventListener('valkyr:switch-agent', handleAgentSwitch);
    return () => {
      window.removeEventListener('valkyr:switch-agent', handleAgentSwitch);
    };
  }, [conversations, activeConversationId, handleSwitchChat]);

  const isTerminal = agentMeta[agent]?.terminalOnly === true;
  const initialInjection = useMemo(() => {
    if (!isTerminal) return null;
    const md = task.metadata || null;
    const p = (md?.initialPrompt || '').trim();
    if (p) return p;
    const issue = md?.linearIssue;
    if (issue) {
      const parts: string[] = [];
      const line1 = `Linked Linear issue: ${issue.identifier}${issue.title ? ` — ${issue.title}` : ''}`;
      parts.push(line1);
      const details: string[] = [];
      if (issue.state?.name) details.push(`State: ${issue.state.name}`);
      if (issue.assignee?.displayName || issue.assignee?.name)
        details.push(`Assignee: ${issue.assignee?.displayName || issue.assignee?.name}`);
      if (issue.team?.key) details.push(`Team: ${issue.team.key}`);
      if (issue.project?.name) details.push(`Project: ${issue.project.name}`);
      if (details.length) parts.push(`Details: ${details.join(' • ')}`);
      if (issue.url) parts.push(`URL: ${issue.url}`);
      const desc = (issue as any)?.description;
      if (typeof desc === 'string' && desc.trim()) {
        const trimmed = desc.trim();
        const max = 1500;
        const body = trimmed.length > max ? trimmed.slice(0, max) + '\n…' : trimmed;
        parts.push('', 'Issue Description:', body);
      }
      const linearContent = parts.join('\n');
      // Prepend comments if any
      if (commentsContext) {
        return `The user has left the following comments on the code changes:\n\n${commentsContext}\n\n${linearContent}`;
      }
      return linearContent;
    }

    const gh = (md as any)?.githubIssue as
      | {
          number: number;
          title?: string;
          url?: string;
          state?: string;
          assignees?: any[];
          labels?: any[];
          body?: string;
        }
      | undefined;
    if (gh) {
      const parts: string[] = [];
      const line1 = `Linked GitHub issue: #${gh.number}${gh.title ? ` — ${gh.title}` : ''}`;
      parts.push(line1);
      const details: string[] = [];
      if (gh.state) details.push(`State: ${gh.state}`);
      try {
        const as = Array.isArray(gh.assignees)
          ? gh.assignees
              .map((a: any) => a?.name || a?.login)
              .filter(Boolean)
              .join(', ')
          : '';
        if (as) details.push(`Assignees: ${as}`);
      } catch {}
      try {
        const ls = Array.isArray(gh.labels)
          ? gh.labels
              .map((l: any) => l?.name)
              .filter(Boolean)
              .join(', ')
          : '';
        if (ls) details.push(`Labels: ${ls}`);
      } catch {}
      if (details.length) parts.push(`Details: ${details.join(' • ')}`);
      if (gh.url) parts.push(`URL: ${gh.url}`);
      const body = typeof gh.body === 'string' ? gh.body.trim() : '';
      if (body) {
        const max = 1500;
        const clipped = body.length > max ? body.slice(0, max) + '\n…' : body;
        parts.push('', 'Issue Description:', clipped);
      }
      const ghContent = parts.join('\n');
      // Prepend comments if any
      if (commentsContext) {
        return `The user has left the following comments on the code changes:\n\n${commentsContext}\n\n${ghContent}`;
      }
      return ghContent;
    }

    const j = md?.jiraIssue as any;
    if (j) {
      const lines: string[] = [];
      const l1 = `Linked Jira issue: ${j.key}${j.summary ? ` — ${j.summary}` : ''}`;
      lines.push(l1);
      const details: string[] = [];
      if (j.status?.name) details.push(`Status: ${j.status.name}`);
      if (j.assignee?.displayName || j.assignee?.name)
        details.push(`Assignee: ${j.assignee?.displayName || j.assignee?.name}`);
      if (j.project?.key) details.push(`Project: ${j.project.key}`);
      if (details.length) lines.push(`Details: ${details.join(' • ')}`);
      if (j.url) lines.push(`URL: ${j.url}`);
      const desc = typeof j.description === 'string' ? j.description.trim() : '';
      if (desc) {
        const max = 1500;
        const clipped = desc.length > max ? desc.slice(0, max) + '\n…' : desc;
        lines.push('', 'Issue Description:', clipped);
      }
      const jiraContent = lines.join('\n');
      // Prepend comments if any
      if (commentsContext) {
        return `The user has left the following comments on the code changes:\n\n${commentsContext}\n\n${jiraContent}`;
      }
      return jiraContent;
    }

    // If we have comments but no other context, return just the comments
    if (commentsContext) {
      return `The user has left the following comments on the code changes:\n\n${commentsContext}`;
    }

    return null;
  }, [isTerminal, task.metadata, commentsContext]);

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
        className={`flex h-full flex-col ${effectiveTheme === 'dark-black' ? 'bg-black' : 'bg-card'} ${className}`}
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
          onCancel={() => {
            setChatToDelete(null);
            setShowDeleteChatModal(false);
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {(() => {
            if (isAgentInstalled !== true) {
              return (
                <InstallBanner
                  agent={agent as any}
                  terminalId={terminalId}
                  installCommand={getInstallCommandForProvider(agent as any)}
                  onRunInstall={runInstallCommand}
                  onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                />
              );
            }
            if (cliStartFailed) {
              return (
                <InstallBanner
                  agent={agent as any}
                  terminalId={terminalId}
                  onRunInstall={runInstallCommand}
                  onOpenExternal={(url) => window.electronAPI.openExternal(url)}
                />
              );
            }
            return null;
          })()}
          <div
            ref={chatScrollContainerRef}
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3 pt-3"
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
                    className={`border-border/50 min-w-[400px] flex-1 overflow-hidden rounded-md border ${agentBg}`}
                    onClick={() => setActiveConversationId(conv.id)}
                  >
                    <AcpChatPane
                      taskId={task.id}
                      conversationId={conv.id}
                      providerId={convAgent}
                      cwd={terminalCwd || task.path || '.'}
                      projectPath={projectPath || undefined}
                      isActive={isActive}
                      conversationTitle={conv.title}
                      onConversationTitleChange={(title) => {
                        setConversations((prev) =>
                          prev.map((c) => (c.id === conv.id ? { ...c, title } : c))
                        );
                      }}
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
                      className="h-full w-full"
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
