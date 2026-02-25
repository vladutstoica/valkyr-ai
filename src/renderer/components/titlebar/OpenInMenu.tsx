import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { getAppById, isValidOpenInAppId, type OpenInAppId } from '@shared/openInApps';
import { useOpenInApps } from '../../hooks/useOpenInApps';

interface OpenInMenuProps {
  path: string;
  align?: 'left' | 'right';
  isRemote?: boolean;
  sshConnectionId?: string | null;
}

const OpenInMenu: React.FC<OpenInMenuProps> = ({
  path,
  align = 'right',
  isRemote = false,
  sshConnectionId = null,
}) => {
  const [defaultApp, setDefaultApp] = React.useState<OpenInAppId | null>(null);
  const { toast } = useToast();
  const { icons, installedApps, availability, loading } = useOpenInApps();

  React.useEffect(() => {
    const fetchDefaultApp = async () => {
      try {
        const res = await window.electronAPI?.getSettings?.();
        if (res?.success && res.settings?.defaultOpenInApp) {
          const app = res.settings.defaultOpenInApp;
          if (isValidOpenInAppId(app)) {
            setDefaultApp(app);
          }
        }
      } catch (e) {
        console.error('Failed to fetch default open in app:', e);
      }
    };
    void fetchDefaultApp();

    const handleChange = (e: CustomEvent<OpenInAppId>) => {
      if (isValidOpenInAppId(e.detail)) {
        setDefaultApp(e.detail);
      }
    };
    window.addEventListener('defaultOpenInAppChanged', handleChange as EventListener);
    return () => {
      window.removeEventListener('defaultOpenInAppChanged', handleChange as EventListener);
    };
  }, []);

  const callOpen = async (appId: OpenInAppId) => {
    const appConfig = getAppById(appId);
    const label = appConfig?.label || appId;

    void import('../../lib/telemetryClient').then(({ captureTelemetry }) => {
      captureTelemetry('toolbar_open_in_selected', { app: appId });
    });
    try {
      const res = await window.electronAPI?.openIn?.({
        app: appId,
        path,
        isRemote,
        sshConnectionId,
      });
      if (!res?.success) {
        toast({
          title: `Open in ${label} failed`,
          description: res?.error || 'Application not available.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: `Open in ${label} failed`,
        description: e?.message || String(e),
        variant: 'destructive',
      });
    }
  };

  const sortedApps = React.useMemo(() => {
    if (!defaultApp) return installedApps;
    return [...installedApps].sort((a, b) => {
      if (a.id === defaultApp) return -1;
      if (b.id === defaultApp) return 1;
      return 0;
    });
  }, [defaultApp, installedApps]);

  const buttonAppId = React.useMemo(() => {
    if (defaultApp && installedApps.some((app) => app.id === defaultApp)) {
      return defaultApp;
    }
    return installedApps[0]?.id;
  }, [defaultApp, installedApps]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=open]:bg-background/80 data-[state=open]:text-foreground h-7 gap-1.5 px-2 text-[13px] leading-none font-medium"
          onClick={() => {
            void import('../../lib/telemetryClient').then(({ captureTelemetry }) => {
              captureTelemetry('toolbar_open_in_menu_clicked', { state: 'open' });
            });
          }}
        >
          <span>Open in</span>
          {buttonAppId && icons[buttonAppId] && (
            <img
              src={icons[buttonAppId]}
              alt={getAppById(buttonAppId)?.label}
              className="h-4 w-4 rounded-md"
            />
          )}
          <ChevronDown className="h-3 w-3 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align === 'right' ? 'end' : 'start'} className="min-w-[180px]">
        {sortedApps.map((app) => {
          const isAvailable = loading ? availability[app.id] === true : true;
          return (
            <DropdownMenuItem
              key={app.id}
              onClick={() => callOpen(app.id)}
              disabled={!isAvailable}
              className="gap-2"
            >
              {icons[app.id] && (
                <img src={icons[app.id]} alt={app.label} className="h-4 w-4 rounded-md" />
              )}
              <span>{app.label}</span>
              {app.id === defaultApp && (
                <span className="text-muted-foreground ml-auto text-xs">Default</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default OpenInMenu;
