import React, { useCallback, useEffect, useState } from 'react';
import { PROVIDERS } from '@shared/providers/registry';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Eye, EyeOff, Trash2 } from 'lucide-react';

type KeyState = Record<string, { hasKey: boolean; editing: boolean; value: string }>;

const ProviderKeysSettingsCard: React.FC = () => {
  const [keyState, setKeyState] = useState<KeyState>({});
  const [loading, setLoading] = useState(true);

  // Collect all unique env vars across providers
  const allEnvVars = React.useMemo(() => {
    const vars = new Set<string>();
    for (const p of PROVIDERS) {
      if (p.envVars) {
        for (const v of p.envVars) vars.add(v);
      }
    }
    return Array.from(vars).sort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await window.electronAPI.listProviderKeys();
        if (cancelled) return;
        const storedKeys = new Set(res?.success ? res.data ?? [] : []);
        const state: KeyState = {};
        for (const envVar of allEnvVars) {
          state[envVar] = { hasKey: storedKeys.has(envVar), editing: false, value: '' };
        }
        setKeyState(state);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [allEnvVars]);

  const handleSave = useCallback(async (envVar: string, value: string) => {
    if (!value.trim()) return;
    const res = await window.electronAPI.setProviderKey({ envVar, value: value.trim() });
    if (res?.success) {
      setKeyState((prev) => ({
        ...prev,
        [envVar]: { hasKey: true, editing: false, value: '' },
      }));
    }
  }, []);

  const handleDelete = useCallback(async (envVar: string) => {
    const res = await window.electronAPI.deleteProviderKey({ envVar });
    if (res?.success) {
      setKeyState((prev) => ({
        ...prev,
        [envVar]: { hasKey: false, editing: false, value: '' },
      }));
    }
  }, []);

  const toggleEditing = useCallback((envVar: string) => {
    setKeyState((prev) => ({
      ...prev,
      [envVar]: { ...prev[envVar], editing: !prev[envVar]?.editing, value: '' },
    }));
  }, []);

  const handleValueChange = useCallback((envVar: string, value: string) => {
    setKeyState((prev) => ({
      ...prev,
      [envVar]: { ...prev[envVar], value },
    }));
  }, []);

  if (loading) {
    return <div className="text-muted-foreground text-xs">Loading...</div>;
  }

  if (allEnvVars.length === 0) {
    return (
      <div className="text-muted-foreground text-xs">
        No provider API keys to configure.
      </div>
    );
  }

  // Group env vars by provider for display
  const envVarProviders = new Map<string, string[]>();
  for (const p of PROVIDERS) {
    if (p.envVars) {
      for (const v of p.envVars) {
        const list = envVarProviders.get(v) || [];
        list.push(p.name);
        envVarProviders.set(v, list);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-xs">
        Store API keys securely in your system keychain. Keys are injected into agent environments
        automatically. Environment variables set in your shell take priority over stored keys.
      </div>
      <div className="space-y-2">
        {allEnvVars.map((envVar) => {
          const state = keyState[envVar];
          const providers = envVarProviders.get(envVar) || [];
          return (
            <div
              key={envVar}
              className="border-border/50 space-y-1.5 rounded-md border p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium font-mono">{envVar}</Label>
                  <div className="text-muted-foreground text-[10px]">
                    {providers.join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {state?.hasKey && !state.editing && (
                    <span className="text-[10px] text-green-500 mr-1">Stored</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => toggleEditing(envVar)}
                    title={state?.editing ? 'Cancel' : 'Edit'}
                  >
                    {state?.editing ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                  {state?.hasKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleDelete(envVar)}
                      title="Remove key"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              {state?.editing && (
                <div className="flex gap-2">
                  <Input
                    className="h-7 flex-1 text-xs font-mono"
                    type="password"
                    placeholder="Paste API key..."
                    value={state.value}
                    onChange={(e) => handleValueChange(envVar, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSave(envVar, state.value);
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!state.value.trim()}
                    onClick={() => handleSave(envVar, state.value)}
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProviderKeysSettingsCard;
