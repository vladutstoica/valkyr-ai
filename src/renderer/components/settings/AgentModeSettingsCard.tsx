import React, { useEffect, useState } from 'react';
import { PROVIDERS, type ProviderId } from '@shared/providers/registry';
import { getSettings, updateSettings } from '../../services/settingsService';

type ChatMode = 'acp' | 'cli';

type ProviderMode = {
  id: ProviderId;
  name: string;
  mode: ChatMode;
};

const ACP_PROVIDERS = PROVIDERS.filter((p) => p.acpSupport);

const AgentModeSettingsCard: React.FC = () => {
  const [providers, setProviders] = useState<ProviderMode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        const overrides = settings?.providerOverrides ?? {};
        setProviders(
          ACP_PROVIDERS.map((p) => ({
            id: p.id,
            name: p.name,
            mode: (overrides[p.id]?.defaultChatMode as ChatMode) ?? 'acp',
          }))
        );
      } catch {
        setProviders(
          ACP_PROVIDERS.map((p) => ({ id: p.id, name: p.name, mode: 'acp' as ChatMode }))
        );
      }
      setLoading(false);
    })();
  }, []);

  const toggleMode = async (providerId: ProviderId, newMode: ChatMode) => {
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, mode: newMode } : p)));
    try {
      const settings = await getSettings();
      const overrides = { ...(settings?.providerOverrides ?? {}) };
      overrides[providerId] = {
        ...overrides[providerId],
        defaultChatMode: newMode,
      };
      await updateSettings({ providerOverrides: overrides });
    } catch (error) {
      console.error('Failed to update agent mode:', error);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground mb-3 text-xs">
        ACP provides structured communication with richer status and chat UI. CLI mode runs the
        agent directly in a terminal.
      </div>
      {providers.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm">{p.name}</span>
          <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
            <button
              type="button"
              onClick={() => toggleMode(p.id, 'acp')}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                p.mode === 'acp'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ACP
            </button>
            <button
              type="button"
              onClick={() => toggleMode(p.id, 'cli')}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                p.mode === 'cli'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              CLI
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AgentModeSettingsCard;
