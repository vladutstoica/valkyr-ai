import React, { useCallback, useEffect, useState } from 'react';
import { AgentSelector } from './AgentSelector';
import type { Agent } from '../types';
import { isValidProviderId } from '@shared/providers/registry';
import { getSettings, updateSettings } from '../services/settingsService';

const DEFAULT_AGENT: Agent = 'claude';

const DefaultAgentSettingsCard: React.FC = () => {
  const [defaultAgent, setDefaultAgent] = useState<Agent>(DEFAULT_AGENT);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const settings = await getSettings();
      if (settings?.defaultProvider) {
        setDefaultAgent(isValidProviderId(settings.defaultProvider) ? (settings.defaultProvider as Agent) : DEFAULT_AGENT);
      } else {
        setDefaultAgent(DEFAULT_AGENT);
      }
    } catch {
      setDefaultAgent(DEFAULT_AGENT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (agent: Agent) => {
    setSaving(true);
    void import('../lib/telemetryClient').then(({ captureTelemetry }) => {
      captureTelemetry('default_agent_changed', { agent });
    });
    try {
      await updateSettings({ defaultProvider: agent });
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground space-y-1 text-xs">
        <div>The agent that will be selected by default when creating a new session.</div>
      </div>
      <div className="w-full max-w-xs">
        <AgentSelector
          value={defaultAgent}
          onChange={(agent) => {
            setDefaultAgent(agent);
            void save(agent);
          }}
          disabled={loading || saving}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default DefaultAgentSettingsCard;
