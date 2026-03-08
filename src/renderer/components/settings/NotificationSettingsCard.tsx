import React, { useEffect, useState } from 'react';
import { Switch } from '../ui/switch';
import { getSettings, updateSettings } from '../../services/settingsService';

const NotificationSettingsCard: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [sound, setSound] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        if (settings) {
          setEnabled(Boolean(settings.notifications?.enabled ?? true));
          setSound(Boolean(settings.notifications?.sound ?? true));
        }
      } catch (error) {
        console.error('Failed to load notification settings:', error);
      }
      setLoading(false);
    })();
  }, []);

  const updateEnabled = async (next: boolean) => {
    setEnabled(next);
    void import('../../lib/telemetryClient').then(({ captureTelemetry }) => {
      captureTelemetry('notification_settings_changed', { enabled: next, sound });
    });
    try {
      await updateSettings({
        notifications: { enabled: next, sound },
      });
    } catch (error) {
      console.error('Failed to update notification enabled setting:', error);
    }
  };

  const updateSound = async (next: boolean) => {
    setSound(next);
    void import('../../lib/telemetryClient').then(({ captureTelemetry }) => {
      captureTelemetry('notification_settings_changed', { enabled, sound: next });
    });
    try {
      await updateSettings({
        notifications: { enabled, sound: next },
      });
    } catch (error) {
      console.error('Failed to update notification sound setting:', error);
    }
  };

  return (
    <div className="border-border/60 bg-muted/10 rounded-xl border p-4">
      <div className="text-muted-foreground mb-4 text-sm">
        Get notified when agents complete tasks.
      </div>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">Enable notifications</span>
          <Switch checked={enabled} disabled={loading} onCheckedChange={updateEnabled} />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">Enable sound</span>
          <Switch checked={sound} disabled={loading || !enabled} onCheckedChange={updateSound} />
        </label>
      </div>
    </div>
  );
};

export default NotificationSettingsCard;
