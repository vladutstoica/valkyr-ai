import { useState, useCallback, useMemo, useEffect, type RefObject } from 'react';
import type { Agent } from '../types';
import type { Conversation } from '../../main/services/DatabaseService';
import { agentConfig } from '../lib/agentConfig';
import { getSettings } from '../services/settingsService';
import {
  getConversations,
  saveConversation,
  deleteConversation,
  createConversation,
  getOrCreateDefaultConversation,
  setActiveConversation,
  updateConversationAcpSessionId,
  reorderConversations,
} from '../services/conversationService';
import { terminalSessionRegistry } from '../terminal/SessionRegistry';

interface UseConversationManagerOptions {
  taskId: string;
  taskAgentId?: string;
  activated: boolean;
  agent: Agent;
  setAgent: (agent: Agent) => void;
  initialAgentRef: RefObject<Agent | undefined>;
  chatScrollContainerRef: RefObject<HTMLDivElement | null>;
  toast: (opts: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
  }) => void;
}

export function useConversationManager({
  taskId,
  taskAgentId,
  activated,
  agent,
  setAgent,
  initialAgentRef,
  chatScrollContainerRef,
  toast,
}: UseConversationManagerOptions) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [showCreateChatModal, setShowCreateChatModal] = useState(false);
  const [showDeleteChatModal, setShowDeleteChatModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // Load conversations when task changes (deferred until first activation)
  useEffect(() => {
    if (!activated) return;
    const loadConversations = async () => {
      setConversationsLoaded(false);
      const result = await getConversations(taskId);

      if (result.success && result.conversations && result.conversations.length > 0) {
        const convs = result.conversations;
        setConversations(convs);

        let chosen: Conversation | undefined;
        setActiveConversationId((prev) => {
          if (prev && convs.some((c: Conversation) => c.id === prev)) {
            chosen = convs.find((c: Conversation) => c.id === prev);
            return prev;
          }
          const active = convs.find((c: Conversation) => c.isActive);
          chosen = active || convs[0]!;
          if (!active && chosen) {
            setActiveConversation({
              taskId,
              conversationId: chosen.id,
            });
          }
          return chosen?.id ?? null;
        });

        if (chosen?.provider) {
          setAgent(chosen.provider as Agent);
        } else {
          try {
            const lastKey = `agent:last:${taskId}`;
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
        const defaultResult = await getOrCreateDefaultConversation(taskId);
        if (defaultResult.success && defaultResult.conversation) {
          const taskAgent = taskAgentId || agent;

          const s = await getSettings();
          const overrides = s?.providerOverrides;
          const agentOverride = overrides?.[taskAgent];
          const defaultMode =
            agentOverride?.defaultChatMode === 'cli'
              ? 'pty'
              : defaultResult.conversation.mode || 'acp';

          const conversationWithAgent = {
            ...defaultResult.conversation,
            provider: taskAgent,
            isMain: true,
            mode: defaultMode,
          };
          setConversations([conversationWithAgent]);
          setActiveConversationId(defaultResult.conversation.id);
          setAgent(taskAgent as Agent);
          await saveConversation(conversationWithAgent);
          setConversationsLoaded(true);
        }
      }
    };

    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, taskAgentId, activated]);

  const handleCreateChat = useCallback(
    async (title: string, newAgent: string, mode?: 'acp' | 'pty') => {
      try {
        const result = await createConversation({
          taskId,
          title,
          provider: newAgent,
          isMain: false,
          mode,
        });

        if (result.success && result.conversation) {
          const conversationsResult = await getConversations(taskId);
          if (conversationsResult.success) {
            setConversations(conversationsResult.conversations || []);
          }
          setActiveConversationId(result.conversation.id);
          setAgent(newAgent as Agent);
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
    [taskId, toast, setAgent, chatScrollContainerRef]
  );

  const handleCreateNewChat = useCallback(() => {
    setShowCreateChatModal(true);
  }, []);

  const handleResumeSession = useCallback(
    async (acpSessionId: string, title?: string) => {
      try {
        const config = agentConfig[agent as Agent];
        const chatTitle = title || `Resumed: ${config?.name || agent}`;

        const result = await createConversation({
          taskId,
          title: chatTitle,
          provider: agent,
          isMain: false,
        });

        if (result.success && result.conversation) {
          await updateConversationAcpSessionId({
            conversationId: result.conversation.id,
            acpSessionId,
          });

          const conversationsResult = await getConversations(taskId);
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
    [agent, taskId, toast]
  );

  const handleSwitchChat = useCallback(
    async (conversationId: string) => {
      await setActiveConversation({
        taskId,
        conversationId,
      });
      setActiveConversationId(conversationId);

      setConversations((prev) => {
        const conv = prev.find((c) => c.id === conversationId);
        if (conv?.provider) setAgent(conv.provider as Agent);
        return prev;
      });
    },
    [taskId, setAgent]
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

      setChatToDelete(conversationId);
      setShowDeleteChatModal(true);
    },
    [conversations.length, toast]
  );

  const handleConfirmDeleteChat = useCallback(async () => {
    if (!chatToDelete) return;

    const convToDelete = conversations.find((c) => c.id === chatToDelete);
    const convAgent = convToDelete?.provider || agent;
    const terminalToDispose = `${convAgent}-chat-${chatToDelete}`;
    terminalSessionRegistry.dispose(terminalToDispose);

    const acpSessionKey = `${convAgent}-acp-${chatToDelete}`;
    window.electronAPI.acpKill({ sessionKey: acpSessionKey }).catch(() => {});

    await deleteConversation(chatToDelete);

    const result = await getConversations(taskId);
    if (result.success) {
      setConversations(result.conversations || []);
      if (
        chatToDelete === activeConversationId &&
        result.conversations &&
        result.conversations.length > 0
      ) {
        const newActive = result.conversations[0];
        await setActiveConversation({
          taskId,
          conversationId: newActive.id,
        });
        setActiveConversationId(newActive.id);
        if (newActive.provider) {
          setAgent(newActive.provider as Agent);
        }
      }
    }

    setChatToDelete(null);
    setShowDeleteChatModal(false);
  }, [chatToDelete, conversations, agent, taskId, activeConversationId, setAgent]);

  const handleClearChat = useCallback(
    (conversationId: string) => {
      const conv = conversations.find((c) => c.id === conversationId);
      const convAgent = conv?.provider || agent;
      const config = agentConfig[convAgent as Agent];
      const title = config?.name || convAgent;
      (async () => {
        const terminalToDispose = `${convAgent}-chat-${conversationId}`;
        terminalSessionRegistry.dispose(terminalToDispose);
        const acpSessionKey = `${convAgent}-acp-${conversationId}`;
        window.electronAPI.acpKill({ sessionKey: acpSessionKey }).catch(() => {});
        await deleteConversation(conversationId);
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
      await reorderConversations({ taskId, conversationIds: newOrder });
      const result = await getConversations(taskId);
      if (result.success) {
        setConversations(result.conversations || []);
      }
    },
    [conversations, taskId]
  );

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
          return a.displayOrder - b.displayOrder;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [conversations]
  );

  const handleCancelDeleteChat = useCallback(() => {
    setChatToDelete(null);
    setShowDeleteChatModal(false);
  }, []);

  const updateConversationTitle = useCallback((conversationId: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title } : c)));
  }, []);

  return {
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
  };
}
