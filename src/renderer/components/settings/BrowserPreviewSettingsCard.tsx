import React from 'react';
import chromeLogo from '../../../assets/images/chrome.png';
import safariLogo from '../../../assets/images/safari.png';
import firefoxLogo from '../../../assets/images/firefox.png';
import atlasLogo from '../../../assets/images/atlas.png';
import chromiumLogo from '../../../assets/images/chromium.png';
import diaLogo from '../../../assets/images/dia.png';
import cometLogo from '../../../assets/images/comet.png';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getSettings, updateSettings } from '../../services/settingsService';

export default function BrowserPreviewSettingsCard() {
  const [enabled, setEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        const en = Boolean(s?.browserPreview?.enabled ?? true);
        setEnabled(en);
      } catch {
        // Settings unavailable — keep default
      }
      setLoading(false);
    })();
  }, []);

  const update = async (next: boolean) => {
    setEnabled(next);
    await updateSettings({ browserPreview: { enabled: next } });
  };

  const Badge: React.FC<{
    label: string;
    iconSrc?: string;
    fallback?: React.ReactNode;
    active?: boolean;
    disabled?: boolean;
    tooltip?: string;
  }> = ({ label, iconSrc, fallback, active, disabled, tooltip }) => {
    const [broken, setBroken] = React.useState(false);
    const base = 'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs';
    const style = active
      ? 'border border-border text-foreground'
      : 'border border-border text-muted-foreground opacity-70';
    const node = (
      <span className={`${base} ${style}`} aria-disabled={disabled}>
        {iconSrc && !broken ? (
          <img
            src={iconSrc}
            alt=""
            className="h-3.5 w-3.5 rounded-xs"
            onError={() => setBroken(true)}
          />
        ) : (
          fallback || null
        )}
        <span>{label}</span>
      </span>
    );
    if (tooltip || disabled) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{node}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {tooltip || 'Coming soon'}
          </TooltipContent>
        </Tooltip>
      );
    }
    return node;
  };

  return (
    <div className="border-border/60 bg-muted/10 rounded-xl border p-4">
      <div className="text-muted-foreground mb-2 text-sm">
        Preview UI changes using the built-in browser view.
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={enabled}
          disabled={loading}
          onCheckedChange={(checked) => update(checked === true)}
        />
        Enable in‑app browser preview
      </label>
      <div className="text-muted-foreground mt-3 text-xs">Engine</div>
      <TooltipProvider delayDuration={150}>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge label="Chromium" iconSrc={chromiumLogo} active />
          <Badge label="Safari" iconSrc={safariLogo} disabled tooltip="Coming soon" />
          <Badge label="Chrome" iconSrc={chromeLogo} disabled tooltip="Coming soon" />
          <Badge label="Firefox" iconSrc={firefoxLogo} disabled tooltip="Coming soon" />
          <Badge label="ChatGPT Atlas" iconSrc={atlasLogo} disabled tooltip="Coming soon" />
          <Badge label="Dia" iconSrc={diaLogo} disabled tooltip="Coming soon" />
          <Badge label="Comet" iconSrc={cometLogo} disabled tooltip="Coming soon" />
        </div>
      </TooltipProvider>
    </div>
  );
}
