import React, { useCallback, useEffect, useState } from 'react';
import { PROVIDERS, type ProviderId } from '@shared/providers/registry';
import { Label } from './ui/label';
import { Input } from './ui/input';

type ProviderOverride = { defaultChatMode?: 'acp' | 'cli'; cliCommand?: string };
type Overrides = Partial<Record<ProviderId, ProviderOverride>>;

const ProviderChatModeSettingsCard: React.FC = () => {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [installedProviders, setInstalledProviders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Providers that have ACP support
  const acpProviders = PROVIDERS.filter((p) => p.acpSupport);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          window.electronAPI.getSettings(),
          window.electronAPI.getProviderStatuses?.() ?? Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (settingsRes?.success && settingsRes.settings?.providerOverrides) {
          setOverrides(settingsRes.settings.providerOverrides as Overrides);
        }
        if (statusRes?.success && statusRes.statuses) {
          const installed = new Set<string>();
          for (const [id, status] of Object.entries(statusRes.statuses)) {
            if ((status as any)?.installed) installed.add(id);
          }
          setInstalledProviders(installed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Overrides) => {
    setOverrides(next);
    await window.electronAPI.updateSettings({ providerOverrides: next } as any);
  }, []);

  const handleModeToggle = useCallback(
    (providerId: ProviderId, mode: 'acp' | 'cli') => {
      const next = { ...overrides };
      next[providerId] = { ...next[providerId], defaultChatMode: mode };
      void save(next);
    },
    [overrides, save]
  );

  const handleCliCommandChange = useCallback(
    (providerId: ProviderId, cliCommand: string) => {
      const next = { ...overrides };
      if (cliCommand.trim()) {
        next[providerId] = { ...next[providerId], cliCommand: cliCommand.trim() };
      } else {
        const entry = { ...next[providerId] };
        delete entry.cliCommand;
        next[providerId] = entry;
      }
      void save(next);
    },
    [overrides, save]
  );

  // Only show providers that have ACP support AND are installed
  const visibleProviders = acpProviders.filter((p) => installedProviders.has(p.id));

  if (loading) {
    return <div className="text-muted-foreground text-xs">Loading...</div>;
  }

  if (visibleProviders.length === 0) {
    return (
      <div className="text-muted-foreground text-xs">
        No ACP-capable agents installed. Install an agent with ACP support to configure chat modes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-xs">
        Choose the default chat mode for agents that support both ACP (structured chat) and CLI
        (terminal). You can also override the CLI command used per agent.
      </div>
      <div className="space-y-3">
        {visibleProviders.map((provider) => {
          const override = overrides[provider.id];
          const currentMode = override?.defaultChatMode ?? 'acp';
          return (
            <div
              key={provider.id}
              className="border-border/50 space-y-2 rounded-md border p-3"
            >
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{provider.name}</Label>
                <div className="flex gap-1 rounded-md border p-0.5">
                  <button
                    type="button"
                    className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      currentMode === 'acp'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleModeToggle(provider.id, 'acp')}
                  >
                    ACP
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      currentMode === 'cli'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleModeToggle(provider.id, 'cli')}
                  >
                    CLI
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-[10px]">
                  Custom CLI command (optional)
                </Label>
                <Input
                  className="h-7 text-xs"
                  placeholder={provider.cli || provider.acpSupport?.command || ''}
                  value={override?.cliCommand ?? ''}
                  onChange={(e) => handleCliCommandChange(provider.id, e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProviderChatModeSettingsCard;
