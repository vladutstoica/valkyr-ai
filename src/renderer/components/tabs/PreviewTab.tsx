import * as React from 'react';
import {
  RefreshCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  usePreviewState,
  DEVICE_DIMENSIONS,
  ZOOM_LEVELS,
  type DevicePreset,
  type ZoomLevel,
} from '@/hooks/usePreviewState';

interface PreviewTabProps {
  taskId?: string | null;
  className?: string;
}

export function PreviewTab({ taskId, className }: PreviewTabProps) {
  const {
    url,
    devicePreset,
    zoom,
    refreshKey,
    setUrl,
    setDevicePreset,
    setZoom,
    refresh,
  } = usePreviewState();

  const [inputUrl, setInputUrl] = React.useState(url);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Sync input URL with store URL
  React.useEffect(() => {
    setInputUrl(url);
  }, [url]);

  // Handle URL form submission
  const handleUrlSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let nextUrl = inputUrl.trim();
      if (!nextUrl) return;
      // Add protocol if missing
      if (!/^https?:\/\//i.test(nextUrl)) {
        nextUrl = `http://${nextUrl}`;
      }
      setUrl(nextUrl);
    },
    [inputUrl, setUrl]
  );

  // Handle refresh
  const handleRefresh = React.useCallback(() => {
    refresh();
    // Also reload iframe directly
    if (iframeRef.current) {
      try {
        iframeRef.current.src = iframeRef.current.src;
      } catch {
        // Ignore cross-origin errors
      }
    }
  }, [refresh]);

  // Handle open in external browser
  const handleOpenExternal = React.useCallback(() => {
    if (url && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    }
  }, [url]);

  // Calculate iframe dimensions based on device preset and zoom
  const getIframeDimensions = React.useCallback(() => {
    const dimensions = DEVICE_DIMENSIONS[devicePreset];
    const scale = zoom / 100;

    if (devicePreset === 'desktop') {
      return {
        width: '100%',
        height: '100%',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      };
    }

    return {
      width: dimensions.width,
      height: dimensions.height,
      transform: `scale(${scale})`,
      transformOrigin: 'top center',
    };
  }, [devicePreset, zoom]);

  const iframeDimensions = getIframeDimensions();

  return (
    <TooltipProvider>
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {/* Top toolbar with URL bar */}
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-3">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={handleUrlSubmit}
        >
          <span className="text-xs text-muted-foreground">URL:</span>
          <Input
            className="h-7 min-w-0 flex-1 px-2 text-xs"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </form>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRefresh}
                aria-label="Refresh preview"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleOpenExternal}
                aria-label="Open in external browser"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in browser</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Preview container */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-muted/30"
      >
        <div
          className={cn(
            'flex h-full w-full',
            devicePreset !== 'desktop' && 'items-start justify-center pt-4'
          )}
        >
          <div
            className={cn(
              'relative bg-white',
              devicePreset !== 'desktop' &&
                'rounded-lg border border-border shadow-lg'
            )}
            style={{
              width: iframeDimensions.width,
              height: iframeDimensions.height,
              transform: iframeDimensions.transform,
              transformOrigin: iframeDimensions.transformOrigin,
            }}
          >
            <iframe
              ref={iframeRef}
              key={refreshKey}
              src={url}
              className="h-full w-full border-0"
              title="Preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          </div>
        </div>
      </div>

      {/* Bottom toolbar with device presets and zoom */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-t border-border bg-muted/50 px-3">
        <div className="flex items-center gap-1">
          <DevicePresetButton
            preset="desktop"
            currentPreset={devicePreset}
            onClick={() => setDevicePreset('desktop')}
            icon={<Monitor className="h-4 w-4" />}
            label="Desktop"
          />
          <DevicePresetButton
            preset="tablet"
            currentPreset={devicePreset}
            onClick={() => setDevicePreset('tablet')}
            icon={<Tablet className="h-4 w-4" />}
            label="Tablet (768px)"
          />
          <DevicePresetButton
            preset="mobile"
            currentPreset={devicePreset}
            onClick={() => setDevicePreset('mobile')}
            icon={<Smartphone className="h-4 w-4" />}
            label="Mobile (375px)"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom:</span>
          <Select
            value={String(zoom)}
            onValueChange={(value) => setZoom(Number(value) as ZoomLevel)}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZOOM_LEVELS.map((level) => (
                <SelectItem key={level} value={String(level)}>
                  {level}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

interface DevicePresetButtonProps {
  preset: DevicePreset;
  currentPreset: DevicePreset;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function DevicePresetButton({
  preset,
  currentPreset,
  onClick,
  icon,
  label,
}: DevicePresetButtonProps) {
  const isActive = preset === currentPreset;

  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
          aria-pressed={isActive}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

export default PreviewTab;
