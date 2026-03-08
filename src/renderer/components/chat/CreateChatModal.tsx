import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { AgentDropdown } from '../agents/AgentDropdown';
import { agentConfig } from '../../lib/agentConfig';
import { isValidProviderId, getProvider } from '@shared/providers/registry';
import type { ProviderId } from '@shared/providers/registry';
import type { Agent } from '../../types';
import type { Conversation } from '../../../main/services/DatabaseService';
import { getSettings } from '../../services/settingsService';

const DEFAULT_AGENT: Agent = 'claude';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChat: (title: string, agent: string, mode: 'acp' | 'pty') => void;
  installedAgents: string[];
  existingConversations?: Conversation[];
}

export function CreateChatModal({
  isOpen,
  onClose,
  onCreateChat,
  installedAgents,
  existingConversations = [],
}: CreateChatModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(DEFAULT_AGENT);
  const [selectedMode, setSelectedMode] = useState<'acp' | 'pty'>('acp');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installedSet = useMemo(() => new Set(installedAgents), [installedAgents]);

  // Check if the selected agent supports ACP
  const selectedProviderDef = useMemo(() => getProvider(selectedAgent as ProviderId), [selectedAgent]);
  const hasAcpSupport = !!selectedProviderDef?.acpSupport;

  // Load default agent from settings and reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);

      let cancel = false;
      getSettings().then((settings) => {
        if (cancel) return;

        const settingsAgent = settings?.defaultProvider;
        const defaultFromSettings: Agent = isValidProviderId(settingsAgent)
          ? (settingsAgent as Agent)
          : DEFAULT_AGENT;

        let chosenAgent: Agent | undefined;
        if (installedSet.has(defaultFromSettings)) {
          chosenAgent = defaultFromSettings;
          setSelectedAgent(defaultFromSettings);
          setError(null);
        } else {
          // Pick first installed agent
          const firstInstalled = Object.keys(agentConfig).find((k) => installedSet.has(k)) as
            | Agent
            | undefined;
          if (firstInstalled) {
            chosenAgent = firstInstalled;
            setSelectedAgent(firstInstalled);
            setError(null);
          } else {
            setError('No agents installed');
          }
        }

        // Set default mode from provider overrides
        if (chosenAgent && settings?.providerOverrides) {
          const override = settings.providerOverrides[chosenAgent];
          const providerDef = getProvider(chosenAgent as ProviderId);
          if (!providerDef?.acpSupport) {
            setSelectedMode('pty');
          } else if (override?.defaultChatMode === 'cli') {
            setSelectedMode('pty');
          } else {
            setSelectedMode('acp');
          }
        } else if (chosenAgent) {
          const providerDef = getProvider(chosenAgent as ProviderId);
          setSelectedMode(providerDef?.acpSupport ? 'acp' : 'pty');
        }
      });

      return () => {
        cancel = true;
      };
    }
  }, [isOpen, installedSet]);

  // Update mode when agent changes
  const handleAgentChange = useCallback(
    (newAgent: Agent) => {
      setSelectedAgent(newAgent);
      const providerDef = getProvider(newAgent as ProviderId);
      if (!providerDef?.acpSupport) {
        setSelectedMode('pty');
      } else {
        // Check provider overrides for default
        getSettings().then((settings) => {
          const override = settings?.providerOverrides?.[newAgent];
          if (override?.defaultChatMode === 'cli') {
            setSelectedMode('pty');
          } else {
            setSelectedMode('acp');
          }
        });
      }
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!installedSet.has(selectedAgent)) {
      setError('Please select an installed agent');
      return;
    }

    setIsCreating(true);
    try {
      // Auto-generate title: AgentName N (where N = count of existing convos with same agent + 1)
      const agentName = agentConfig[selectedAgent]?.name || selectedAgent;
      const sameAgentCount = existingConversations.filter(
        (c) => c.provider === selectedAgent
      ).length;
      const chatTitle = sameAgentCount > 0 ? `${agentName} ${sameAgentCount + 1}` : agentName;
      onCreateChat(chatTitle, selectedAgent, selectedMode);
      onClose();
      setError(null);
    } catch (err) {
      console.error('Failed to create chat:', err);
      setError('Failed to create chat');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isCreating && onClose()}>
      <DialogContent className="max-h-[calc(100vh-48px)] max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
          <DialogDescription className="text-xs">
            Start a new conversation with an agent
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="shrink-0">Agent</Label>
            <AgentDropdown
              value={selectedAgent}
              onChange={handleAgentChange}
              installedAgents={installedAgents}
            />
          </div>
          {hasAcpSupport && (
            <div className="flex items-center gap-4">
              <Label className="shrink-0">Mode</Label>
              <div className="flex rounded-md border p-0.5">
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    selectedMode === 'acp'
                      ? 'bg-primary text-primary-foreground rounded-none'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setSelectedMode('acp')}
                >
                  ACP
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    selectedMode === 'pty'
                      ? 'bg-primary text-primary-foreground rounded-none'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setSelectedMode('pty')}
                >
                  CLI
                </button>
              </div>
              <span className="text-muted-foreground text-[10px]">
                {selectedMode === 'acp' ? 'Structured chat UI' : 'Raw terminal'}
              </span>
            </div>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!!error || isCreating}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
