import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { Separator } from '../ui/separator';
import {
  ChevronLeft,
  Settings2,
  Cable,
  RefreshCw,
  GitBranch,
  Puzzle,
  Palette,
  Info,
  Blocks,
} from 'lucide-react';
import { UpdateCard } from '../UpdateCard';
import IntegrationsCard from '../IntegrationsCard';
import CliAgentsList, { BASE_CLI_AGENTS } from '../CliAgentsList';
import TelemetryCard from '../TelemetryCard';
import ThemeCard from '../ThemeCard';
import BrowserPreviewSettingsCard from '../BrowserPreviewSettingsCard';
import NotificationSettingsCard from '../NotificationSettingsCard';
import RepositorySettingsCard from '../RepositorySettingsCard';
import TerminalSettingsCard from '../TerminalSettingsCard';
import ProjectPrepSettingsCard from '../ProjectPrepSettingsCard';
import Context7SettingsCard from '../Context7SettingsCard';
import DefaultAgentSettingsCard from '../DefaultAgentSettingsCard';
import AcpAgentsList from '../AcpAgentsList';
import DefaultOpenInSettingsCard from '../DefaultOpenInSettingsCard';
import TaskSettingsCard from '../TaskSettingsCard';
import KeyboardSettingsCard from '../KeyboardSettingsCard';
import VoiceInputSettingsCard from '../VoiceInputSettingsCard';
import { SshSettingsCard } from '../ssh/SshSettingsCard';
import { McpView } from '../mcp/McpView';
import { type SettingsTab, ORDERED_TABS } from '../../hooks/useModalState';
import type { CliAgentStatus } from '../../types/connections';

const createDefaultCliAgents = (): CliAgentStatus[] =>
  BASE_CLI_AGENTS.map((agent) => ({ ...agent }));

type CachedAgentStatus = {
  installed: boolean;
  path?: string | null;
  version?: string | null;
  lastChecked?: number;
};

const mapAgentStatusesToCli = (
  statuses: Record<string, CachedAgentStatus | undefined>
): CliAgentStatus[] => {
  return Object.entries(statuses).reduce<CliAgentStatus[]>((acc, [agentId, status]) => {
    if (!status) return acc;
    const base = BASE_CLI_AGENTS.find((agent) => agent.id === agentId);
    acc.push({
      ...(base ?? {
        id: agentId,
        name: agentId,
        status: 'missing' as const,
        docUrl: null,
        installCommand: null,
      }),
      id: agentId,
      name: base?.name ?? agentId,
      status: status.installed ? 'connected' : 'missing',
      version: status.version ?? null,
      command: status.path ?? null,
    });
    return acc;
  }, []);
};

const mergeCliAgents = (incoming: CliAgentStatus[]): CliAgentStatus[] => {
  const mergedMap = new Map<string, CliAgentStatus>();
  BASE_CLI_AGENTS.forEach((agent) => mergedMap.set(agent.id, { ...agent }));
  incoming.forEach((agent) => {
    mergedMap.set(agent.id, { ...(mergedMap.get(agent.id) ?? {}), ...agent });
  });
  return Array.from(mergedMap.values());
};

interface SettingsSection {
  title: string;
  description?: string;
  action?: React.ReactNode;
  render?: () => React.ReactNode;
}

interface SettingsViewProps {
  initialTab?: SettingsTab;
  onBack: () => void;
  projectPath?: string;
}

const SettingsView: React.FC<SettingsViewProps> = ({ initialTab, onBack, projectPath }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'general');
  const [cliAgents, setCliAgents] = useState<CliAgentStatus[]>(() => createDefaultCliAgents());
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliLoading, setCliLoading] = useState<boolean>(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void import('../../lib/telemetryClient').then(({ captureTelemetry }) => {
      captureTelemetry('settings_tab_viewed', { tab: activeTab });
    });
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;

    const applyCachedStatuses = (statuses: Record<string, CachedAgentStatus> | undefined) => {
      if (!statuses) return;
      const agents = mapAgentStatusesToCli(statuses);
      if (!agents.length) return;
      setCliAgents((prev) => mergeCliAgents([...prev, ...agents]));
    };

    const loadCachedStatuses = async () => {
      if (!window?.electronAPI?.getProviderStatuses) return;
      try {
        const result = await window.electronAPI.getProviderStatuses();
        if (cancelled) return;
        if (result?.success && result.statuses) {
          applyCachedStatuses(result.statuses);
        }
      } catch (error) {
        if (!cancelled) console.error('Failed to load cached CLI agent statuses:', error);
      }
    };

    const off =
      window?.electronAPI?.onProviderStatusUpdated?.(
        (payload: { providerId: string; status: CachedAgentStatus }) => {
          if (!payload?.providerId || !payload.status) return;
          applyCachedStatuses({ [payload.providerId]: payload.status });
        }
      ) ?? null;

    void loadCachedStatuses();

    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const fetchCliAgents = useCallback(async () => {
    if (!window?.electronAPI?.getProviderStatuses) {
      setCliAgents(createDefaultCliAgents());
      setCliError('Agent status detection is unavailable in this build.');
      return;
    }

    setCliLoading(true);
    setCliError(null);

    try {
      const result = await window.electronAPI.getProviderStatuses({ refresh: true });
      if (result?.success && result.statuses) {
        const agents = mapAgentStatusesToCli(result.statuses);
        setCliAgents((prev) => mergeCliAgents([...prev, ...agents]));
      } else {
        setCliError(result?.error || 'Failed to detect CLI agents.');
      }
    } catch (error) {
      console.error('CLI detection failed:', error);
      setCliError('Unable to detect CLI agents.');
    } finally {
      setCliLoading(false);
    }
  }, []);

  const tabDetails = useMemo(() => {
    return {
      general: {
        icon: Settings2,
        label: 'General',
        title: 'General',
        sections: [
          { title: 'Tasks', render: () => <TaskSettingsCard /> },
          { title: 'Notifications', render: () => <NotificationSettingsCard /> },
          { title: 'Project preparation', render: () => <ProjectPrepSettingsCard /> },
          { title: 'Voice input', render: () => <VoiceInputSettingsCard /> },
          { title: 'Keyboard shortcuts', render: () => <KeyboardSettingsCard /> },
        ],
      },
      appearance: {
        icon: Palette,
        label: 'Appearance',
        title: 'Appearance',
        sections: [
          { title: 'Theme', render: () => <ThemeCard /> },
          { title: 'Default open in app', render: () => <DefaultOpenInSettingsCard /> },
          { title: 'Terminal font', render: () => <TerminalSettingsCard /> },
          { title: 'In\u2011app Browser Preview', render: () => <BrowserPreviewSettingsCard /> },
        ],
      },
      agents: {
        icon: Puzzle,
        label: 'Agents & Tools',
        title: 'Agents & Tools',
        sections: [
          { title: 'Default agent', render: () => <DefaultAgentSettingsCard /> },
          {
            title: 'ACP Agents',
            description: 'Browse and install ACP-compatible agents from the official registry.',
            render: () => <AcpAgentsList />,
          },
          {
            title: 'Native CLI agents',
            description: 'Disabled \u2014 ACP agents are preferred.',
            action: (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fetchCliAgents}
                disabled={cliLoading}
                aria-busy={cliLoading}
                aria-label="Refresh CLI agents"
              >
                {cliLoading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            ),
            render: () => (
              <div className="pointer-events-none opacity-50">
                <CliAgentsList agents={cliAgents} isLoading={cliLoading} error={cliError} />
              </div>
            ),
          },
          { title: 'MCP Tools', render: () => <Context7SettingsCard /> },
          { title: 'SSH', render: () => <SshSettingsCard /> },
        ],
      },
      mcp: {
        icon: Blocks,
        label: 'MCP Servers',
        title: 'MCP Servers',
        sections: [] as SettingsSection[], // McpView renders directly, not via sections
      },
      connections: {
        icon: Cable,
        label: 'Connections',
        title: 'Connections',
        sections: [{ title: 'Integrations', render: () => <IntegrationsCard /> }],
      },
      repository: {
        icon: GitBranch,
        label: 'Repository',
        title: 'Repository',
        sections: [{ title: 'Branch settings', render: () => <RepositorySettingsCard /> }],
      },
      about: {
        icon: Info,
        label: 'About',
        title: 'About',
        sections: [
          { title: 'Updates', render: () => <UpdateCard /> },
          { title: 'Privacy & Telemetry', render: () => <TelemetryCard /> },
          {
            title: 'Resources',
            render: () => (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-start px-0 text-xs"
                  onClick={() =>
                    window.electronAPI.openExternal(
                      'https://x.com/rabanspiegel/status/1991220598538924097?s=20'
                    )
                  }
                >
                  Watch the demo ↗
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-start px-0 text-xs"
                  onClick={() => window.electronAPI.openExternal('https://docs.emdash.sh')}
                >
                  Documentation ↗
                </Button>
              </div>
            ),
          },
        ],
      },
    } as const;
  }, [cliAgents, cliLoading, cliError, fetchCliAgents]);

  const activeTabDetails = tabDetails[activeTab];

  const renderContent = () => {
    // MCP tab gets its own full-page component
    if (activeTab === 'mcp') {
      return <McpView projectPath={projectPath} />;
    }

    const { sections } = activeTabDetails;
    if (!sections.length) return null;

    return (
      <div className="flex min-w-0 flex-col gap-6">
        {sections.map((section: SettingsSection, index: number) => {
          let renderedContent: React.ReactNode = null;
          if (typeof section.render === 'function') {
            renderedContent = section.render();
          } else if (!section.description) {
            renderedContent = <p className="text-muted-foreground text-sm">Coming soon.</p>;
          }

          const isLast = index === sections.length - 1;

          return (
            <React.Fragment key={section.title}>
              {index > 0 ? <Separator className="border-border/60" /> : null}
              <section className={`space-y-3 ${isLast ? 'pb-6' : ''}`}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{section.title}</h3>
                    {section.action ? <div>{section.action}</div> : null}
                  </div>
                  {section.description ? (
                    <p className="text-muted-foreground text-sm">{section.description}</p>
                  ) : null}
                </div>
                {renderedContent ? (
                  <div className="flex min-w-0 flex-col gap-3">{renderedContent}</div>
                ) : null}
              </section>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-background text-foreground flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="border-border/60 flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      {/* Two-column layout */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar nav */}
        <aside className="border-border/60 bg-muted/20 w-52 shrink-0 overflow-y-auto border-r p-3">
          <nav className="space-y-0.5">
            {ORDERED_TABS.map((tab) => {
              const { icon: Icon, label } = tabDetails[tab];

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`focus-visible:ring-ring focus-visible:ring-offset-background flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden ${
                    activeTab === tab
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{label}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content area */}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-2xl">
            {activeTab !== 'mcp' && (
              <h2 className="mb-6 text-lg font-semibold">{activeTabDetails.title}</h2>
            )}
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
