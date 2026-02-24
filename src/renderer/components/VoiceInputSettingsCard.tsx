import React, { useEffect, useState, useCallback } from 'react';
import { Mic, Trash2 } from 'lucide-react';
import { Switch } from './ui/switch';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VoiceInputSettingsCard: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<{
    downloaded: boolean;
    sizeBytes?: number;
  }>({ downloaded: false });
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    bytesDownloaded: number;
    totalBytes: number;
  } | null>(null);

  // Load settings + model status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsResult, statusResult] = await Promise.all([
          window.electronAPI.getSettings(),
          window.electronAPI.whisperModelStatus(),
        ]);
        if (cancelled) return;
        if (settingsResult.success) {
          setEnabled(settingsResult.settings?.voiceInput?.enabled ?? false);
        }
        if (statusResult.success && statusResult.data) {
          setModelStatus(statusResult.data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for download progress
  useEffect(() => {
    const off = window.electronAPI.onWhisperDownloadProgress?.((data) => {
      setDownloadProgress(data);
    });
    return () => off?.();
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      setError(null);
      setSaving(true);

      try {
        if (next) {
          // Enable: update setting, then download model if needed
          const result = await window.electronAPI.updateSettings({
            voiceInput: { enabled: true },
          });
          if (!result.success) throw new Error(result.error || 'Failed to update settings.');

          // Check if model needs downloading
          const status = await window.electronAPI.whisperModelStatus();
          if (status.success && status.data && !status.data.downloaded) {
            setDownloading(true);
            setDownloadProgress(null);
            try {
              const dlResult = await window.electronAPI.whisperDownloadModel();
              if (!dlResult.success) throw new Error(dlResult.error || 'Download failed.');
              // Refresh model status
              const newStatus = await window.electronAPI.whisperModelStatus();
              if (newStatus.success && newStatus.data) setModelStatus(newStatus.data);
            } catch (dlErr) {
              // Download failed — revert setting
              await window.electronAPI.updateSettings({ voiceInput: { enabled: false } });
              setEnabled(false);
              throw dlErr;
            } finally {
              setDownloading(false);
              setDownloadProgress(null);
            }
          }
        } else {
          // Disable: update setting, then delete model
          const result = await window.electronAPI.updateSettings({
            voiceInput: { enabled: false },
          });
          if (!result.success) throw new Error(result.error || 'Failed to update settings.');

          if (modelStatus.downloaded) {
            await window.electronAPI.whisperDeleteModel();
            setModelStatus({ downloaded: false });
          }
        }
      } catch (err) {
        setEnabled(previous);
        setError(err instanceof Error ? err.message : 'Failed to update voice input settings.');
      } finally {
        setSaving(false);
      }
    },
    [enabled, modelStatus.downloaded]
  );

  return (
    <div className="border-border/60 bg-muted/10 rounded-xl border p-4">
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Mic className="h-4 w-4" />
              Voice input
            </div>
            <div className="text-muted-foreground text-xs">
              Enable microphone button for voice-to-text in chat. Downloads a ~142 MB speech
              recognition model on first use.
            </div>
          </div>
          <Switch
            checked={enabled}
            disabled={loading || saving || downloading}
            onCheckedChange={handleToggle}
          />
        </label>

        {downloading && downloadProgress && (
          <div className="space-y-1">
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all duration-200"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <div className="text-muted-foreground text-xs">
              Downloading model... {downloadProgress.percent}%
              {downloadProgress.totalBytes > 0 &&
                ` (${formatBytes(downloadProgress.bytesDownloaded)} / ${formatBytes(downloadProgress.totalBytes)})`}
            </div>
          </div>
        )}

        {downloading && !downloadProgress && (
          <div className="text-muted-foreground text-xs">Starting download...</div>
        )}

        {!downloading && modelStatus.downloaded && enabled && (
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            Model downloaded
            {modelStatus.sizeBytes != null && ` (${formatBytes(modelStatus.sizeBytes)})`}
          </div>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </div>
  );
};

export default VoiceInputSettingsCard;
