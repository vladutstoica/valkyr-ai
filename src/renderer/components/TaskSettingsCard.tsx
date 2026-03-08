import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Switch } from './ui/switch';
import { getSettings, updateSettings } from '../services/settingsService';

const TaskSettingsCard: React.FC = () => {
  const [autoGenerateName, setAutoGenerateName] = useState(true);
  const [autoApproveByDefault, setAutoApproveByDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getSettings();
        if (cancelled) return;
        if (settings) {
          setAutoGenerateName(settings.tasks?.autoGenerateName ?? true);
          setAutoApproveByDefault(settings.tasks?.autoApproveByDefault ?? false);
        } else {
          setError('Failed to load settings.');
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load settings.';
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAutoGenerateName = async (next: boolean) => {
    const previous = autoGenerateName;
    setAutoGenerateName(next);
    setError(null);
    setSaving(true);
    try {
      const success = await updateSettings({ tasks: { autoGenerateName: next } });
      if (!success) {
        throw new Error('Failed to update settings.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings.';
      setAutoGenerateName(previous);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const updateAutoApproveByDefault = async (next: boolean) => {
    const previous = autoApproveByDefault;
    setAutoApproveByDefault(next);
    setError(null);
    setSaving(true);
    try {
      const success = await updateSettings({
        tasks: { autoApproveByDefault: next },
      });
      if (!success) {
        throw new Error('Failed to update settings.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings.';
      setAutoApproveByDefault(previous);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-border/60 bg-muted/10 rounded-xl border p-4">
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">Auto-generate session names</span>
          <Switch
            checked={autoGenerateName}
            disabled={loading || saving}
            onCheckedChange={updateAutoGenerateName}
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="text-sm">Enable Auto-approve by default in new sessions</div>
            <div className="text-muted-foreground text-xs">
              Skips permission prompts for file operations.{' '}
              <a
                href="https://simonwillison.net/2025/Oct/22/living-dangerously-with-claude/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-foreground inline-flex items-center gap-0.5 underline"
              >
                Learn more
                <ExternalLink className="h-3 w-3" />
              </a>
              <br />
              <span className="text-muted-foreground/70 text-[11px]">
                Supported by: Claude Code, Cursor, Gemini, Qwen, Codex, Rovo, Mistral
              </span>
            </div>
          </div>
          <Switch
            checked={autoApproveByDefault}
            disabled={loading || saving}
            onCheckedChange={updateAutoApproveByDefault}
          />
        </label>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </div>
  );
};

export default TaskSettingsCard;
