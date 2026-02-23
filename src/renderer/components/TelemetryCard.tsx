import React from 'react';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { useTelemetryConsent } from '../hooks/useTelemetryConsent';

const TelemetryCard: React.FC = () => {
  const { prefEnabled, envDisabled, hasKeyAndHost, loading, setTelemetryEnabled } =
    useTelemetryConsent();

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="text-muted-foreground space-y-1 text-xs">
          <p>Help improve Valkyr by sending anonymous usage data.</p>
          <p>
            <span>See </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="group text-muted-foreground hover:text-foreground inline-flex h-auto items-center gap-1 px-0 text-xs font-normal hover:no-underline focus-visible:ring-0 focus-visible:outline-hidden"
              onClick={() =>
                window.electronAPI.openExternal('https://docs.valkyr.dev/security/telemetry')
              }
            >
              <span className="group-hover:text-foreground transition-colors">
                Telemetry information
              </span>
              <span className="text-muted-foreground group-hover:text-foreground text-xs transition-colors">
                ↗
              </span>
            </Button>
            <span> for details.</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Switch
            checked={prefEnabled}
            onCheckedChange={async (checked) => {
              void import('../lib/telemetryClient').then(({ captureTelemetry }) => {
                captureTelemetry('telemetry_toggled', { enabled: checked });
              });
              void setTelemetryEnabled(checked);
            }}
            disabled={loading || envDisabled}
            aria-label="Enable anonymous telemetry"
          />
          {!hasKeyAndHost && (
            <span className="text-muted-foreground text-[10px]">
              Inactive in this build (no PostHog keys)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelemetryCard;
