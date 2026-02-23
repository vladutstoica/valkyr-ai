import React, { useEffect, useState } from 'react';
import { Switch } from './ui/switch';

const RightSidebarSettingsCard: React.FC = () => {
  const [autoRightSidebarBehavior, setAutoRightSidebarBehavior] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.electronAPI.getSettings();
        if (result.success && result.settings) {
          setAutoRightSidebarBehavior(
            Boolean(result.settings.interface?.autoRightSidebarBehavior ?? false)
          );
        }
      } catch (error) {
        console.error('Failed to load right sidebar settings:', error);
      }
      setLoading(false);
    })();
  }, []);

  const updateAutoRightSidebarBehavior = async (next: boolean) => {
    setAutoRightSidebarBehavior(next);
    try {
      await window.electronAPI.updateSettings({
        interface: { autoRightSidebarBehavior: next },
      });
      // Dispatch custom event to notify App.tsx of the setting change
      window.dispatchEvent(
        new CustomEvent('autoRightSidebarBehaviorChanged', { detail: { enabled: next } })
      );
    } catch (error) {
      console.error('Failed to update right sidebar setting:', error);
    }
  };

  return (
    <div className="border-border/60 bg-muted/10 rounded-xl border p-4">
      <div className="text-muted-foreground mb-4 text-sm">
        Automatically manage the right sidebar based on the current view.
      </div>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">Auto-collapse on home pages</span>
            <span className="text-muted-foreground text-xs">
              Collapse sidebar on home/repo pages, expand on tasks
            </span>
          </div>
          <Switch
            checked={autoRightSidebarBehavior}
            disabled={loading}
            onCheckedChange={updateAutoRightSidebarBehavior}
          />
        </label>
      </div>
    </div>
  );
};

export default RightSidebarSettingsCard;
