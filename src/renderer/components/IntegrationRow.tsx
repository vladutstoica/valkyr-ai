import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Button } from './ui/button';

type IntegrationStatus =
  | 'connected'
  | 'disconnected'
  | 'loading'
  | 'error'
  | 'missing'
  | 'needs_key';

interface IntegrationRowProps {
  logoSrc?: string;
  icon?: React.ReactNode;
  name: string;
  onNameClick?: () => void;
  status: IntegrationStatus;
  statusLabel?: string;
  accountLabel?: string;
  middle?: React.ReactNode;
  onConnect?: () => void;
  connectDisabled?: boolean;
  connectContent?: React.ReactNode;
  onDisconnect?: () => void;
  onOpen?: () => void;
  rightExtra?: React.ReactNode;
  showStatusPill?: boolean;
  installCommand?: string | null;
}

const STATUS_CLASSES: Record<IntegrationStatus, string> = {
  connected:
    'border border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  loading: 'border border-border/60 bg-transparent text-muted-foreground',
  error: 'border border-border/60 bg-transparent text-muted-foreground',
  disconnected: 'border border-border/60 bg-transparent text-muted-foreground',
  missing: 'border border-border/60 bg-transparent text-muted-foreground',
  needs_key: 'border border-border/60 bg-transparent text-muted-foreground',
};

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  loading: 'Connecting…',
  error: 'Not connected',
  disconnected: 'Not connected',
  missing: 'Not connected',
  needs_key: 'Not connected',
};

const ICON_WRAPPER =
  'flex h-6 w-6 items-center justify-center rounded-md bg-muted/40 text-muted-foreground';

const IntegrationRow: React.FC<IntegrationRowProps> = ({
  logoSrc,
  icon,
  name,
  onNameClick,
  status,
  statusLabel,
  accountLabel,
  middle,
  onConnect,
  connectDisabled,
  connectContent,
  onDisconnect,
  onOpen,
  rightExtra,
  showStatusPill = true,
  installCommand,
}) => {
  const resolvedStatus = STATUS_CLASSES[status] ? status : 'disconnected';
  const showConnect = resolvedStatus !== 'connected' && status !== 'loading' && !!onConnect;
  const showDisconnect = resolvedStatus === 'connected' && !!onDisconnect;
  const showOpen = resolvedStatus === 'connected' && !!onOpen;
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<number | null>(null);

  const resolvedStatusLabel = statusLabel ?? STATUS_LABELS[status] ?? STATUS_LABELS.disconnected;

  const defaultMiddle =
    status === 'connected' && accountLabel ? (
      <span className="text-muted-foreground truncate text-sm">{accountLabel}</span>
    ) : null;

  const avatar = (
    <span className={ICON_WRAPPER}>
      {logoSrc ? (
        <img src={logoSrc} alt="" className="h-5 w-5 object-contain" />
      ) : icon ? (
        icon
      ) : null}
    </span>
  );

  const handleCopyInstall = async () => {
    if (!installCommand || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    if (copyResetRef.current !== null) {
      window.clearTimeout(copyResetRef.current);
    }
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      copyResetRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetRef.current = null;
      }, 1600);
    } catch {
      setCopied(false);
      copyResetRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  const CopyIcon = copied ? Check : Copy;
  const showInstallCopy = !!installCommand && status !== 'connected';

  return (
    <div className="group hover:bg-muted/40 relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 transition-colors">
      <div className="flex items-center gap-3">
        {avatar}
        {onNameClick ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNameClick}
            className="group text-foreground gap-1 px-0 text-sm font-medium"
          >
            <span>{name}</span>
            <span className="text-muted-foreground group-hover:text-foreground/80 text-xs transition">
              ↗
            </span>
          </Button>
        ) : (
          <span className="text-foreground text-sm font-medium">{name}</span>
        )}
      </div>

      <div className="text-muted-foreground flex items-center justify-end gap-2 text-sm">
        {showInstallCopy ? (
          <TooltipProvider>
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    void handleCopyInstall();
                  }}
                  aria-label={copied ? 'Command copied' : `Copy install command for ${name}`}
                >
                  <CopyIcon className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div className="max-w-[240px] space-y-1">
                  <div className="text-foreground text-xs font-medium">Copy install command</div>
                  <code className="text-tiny text-muted-foreground block truncate font-mono">
                    {installCommand}
                  </code>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}

        <div className="min-w-0">{middle ?? defaultMiddle}</div>
        {showStatusPill ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[resolvedStatus] ?? STATUS_CLASSES.disconnected}`}
          >
            {resolvedStatusLabel}
          </span>
        ) : null}

        {rightExtra}

        {showOpen ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpen}
            aria-label={`Open ${name} settings`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}

        {showDisconnect ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDisconnect}
            aria-label={`Disconnect ${name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}

        {showConnect ? (
          <Button variant="outline" size="sm" onClick={onConnect} disabled={connectDisabled}>
            {connectContent ?? 'Connect'}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default IntegrationRow;
