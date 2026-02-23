import * as React from 'react';
import { RefreshCw, ExternalLink, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { usePreviewState } from '@/hooks/usePreviewState';
import { useTabState } from '@/hooks/useTabState';

// Browser view IPC methods (not in typed interface)
const browserAPI = () =>
  (window as any).electronAPI as {
    browserShow?: (
      bounds: { x: number; y: number; width: number; height: number },
      url?: string
    ) => Promise<any>;
    browserHide?: () => Promise<any>;
    browserSetBounds?: (bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => Promise<any>;
    browserLoadURL?: (url: string, forceReload?: boolean) => Promise<any>;
    browserGoBack?: () => Promise<any>;
    browserGoForward?: () => Promise<any>;
    browserReload?: () => Promise<any>;
    openExternal?: (url: string) => void;
  };

interface PreviewTabProps {
  taskId?: string | null;
  className?: string;
}

const BOUNDS_CHANGE_THRESHOLD = 2;
const BOUNDS_UPDATE_DELAY_MS = 100;

export function PreviewTab({ taskId, className }: PreviewTabProps) {
  const { url, setUrl, refresh, refreshKey } = usePreviewState();
  const activeTab = useTabState((state) => state.activeTab);
  const isActive = activeTab === 'preview';

  const [inputUrl, setInputUrl] = React.useState(url);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastBoundsRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Sync input URL with store URL
  React.useEffect(() => {
    setInputUrl(url);
  }, [url]);

  // Compute bounds for the native browser view
  const computeBounds = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left);
    const y = Math.round(rect.top);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    return { x, y, width: w, height: h };
  }, []);

  // Check if bounds have changed significantly
  const hasBoundsChanged = React.useCallback(
    (newBounds: { x: number; y: number; width: number; height: number }) => {
      if (!lastBoundsRef.current) return true;
      const old = lastBoundsRef.current;
      return (
        Math.abs(old.x - newBounds.x) > BOUNDS_CHANGE_THRESHOLD ||
        Math.abs(old.y - newBounds.y) > BOUNDS_CHANGE_THRESHOLD ||
        Math.abs(old.width - newBounds.width) > BOUNDS_CHANGE_THRESHOLD ||
        Math.abs(old.height - newBounds.height) > BOUNDS_CHANGE_THRESHOLD
      );
    },
    []
  );

  // Track overlay state to hide browser view when modals are open
  const [overlayActive, setOverlayActive] = React.useState(false);

  // Listen for overlay events (modals, settings, etc.)
  React.useEffect(() => {
    const handleOverlay = (e: CustomEvent<{ open: boolean }>) => {
      setOverlayActive(e.detail?.open ?? false);
    };
    window.addEventListener('valkyr:overlay:changed', handleOverlay as EventListener);
    return () => {
      window.removeEventListener('valkyr:overlay:changed', handleOverlay as EventListener);
    };
  }, []);

  // Track last loaded URL to detect changes
  const lastLoadedUrlRef = React.useRef<string | null>(null);

  // Show/hide browser view based on tab visibility and overlay state
  React.useEffect(() => {
    let rafId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const shouldShow = isActive && !!url && !overlayActive;

    if (!shouldShow) {
      try {
        browserAPI().browserHide?.();
        lastBoundsRef.current = null;
      } catch {}
      return;
    }

    // Show the browser view and load URL
    const showBrowser = () => {
      if (cancelled) return;
      const bounds = computeBounds();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const boundsChanged = hasBoundsChanged(bounds);
        const urlChanged = lastLoadedUrlRef.current !== url;

        if (boundsChanged) {
          lastBoundsRef.current = bounds;
        }

        // Show/update view if bounds or URL changed
        if (boundsChanged || urlChanged) {
          try {
            browserAPI().browserShow?.(bounds, url || undefined);
            lastLoadedUrlRef.current = url;

            // Update bounds after a short delay for layout stability
            timeoutId = setTimeout(() => {
              if (cancelled) return;
              const updatedBounds = computeBounds();
              if (updatedBounds && updatedBounds.width > 0 && updatedBounds.height > 0) {
                if (hasBoundsChanged(updatedBounds)) {
                  lastBoundsRef.current = updatedBounds;
                  try {
                    browserAPI().browserSetBounds?.(updatedBounds);
                  } catch {}
                }
              }
            }, BOUNDS_UPDATE_DELAY_MS);
          } catch {}
        }
      }
    };

    rafId = requestAnimationFrame(showBrowser);

    // Handle resize events
    const onResize = () => {
      if (cancelled) return;
      const bounds = computeBounds();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        if (hasBoundsChanged(bounds)) {
          lastBoundsRef.current = bounds;
          try {
            browserAPI().browserSetBounds?.(bounds);
          } catch {}
        }
      }
    };

    window.addEventListener('resize', onResize);
    const resizeObserver = new ResizeObserver(() => onResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      try {
        browserAPI().browserHide?.();
      } catch {}
      window.removeEventListener('resize', onResize);
      try {
        resizeObserver.disconnect();
      } catch {}
    };
  }, [isActive, url, overlayActive, computeBounds, hasBoundsChanged]);

  // Handle refresh
  React.useEffect(() => {
    if (isActive && url && refreshKey > 0) {
      try {
        browserAPI().browserReload?.();
      } catch {}
    }
    // Only trigger on refreshKey changes, not initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

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

  // Handle refresh button
  const handleRefresh = React.useCallback(() => {
    refresh();
    try {
      browserAPI().browserReload?.();
    } catch {}
  }, [refresh]);

  // Handle open in external browser
  const handleOpenExternal = React.useCallback(() => {
    if (url && browserAPI().openExternal) {
      window.electronAPI.openExternal(url);
    }
  }, [url]);

  // Handle navigation
  const handleGoBack = React.useCallback(() => {
    try {
      browserAPI().browserGoBack?.();
    } catch {}
  }, []);

  const handleGoForward = React.useCallback(() => {
    try {
      browserAPI().browserGoForward?.();
    } catch {}
  }, []);

  return (
    <TooltipProvider>
      <div className={cn('bg-background flex h-full flex-col', className)}>
        {/* Top toolbar with URL bar */}
        <div className="border-border bg-muted/50 flex h-10 flex-shrink-0 items-center gap-2 border-b px-3">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleGoBack} aria-label="Go back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Back</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleGoForward}
                  aria-label="Go forward"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Forward</TooltipContent>
            </Tooltip>

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
          </div>

          <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={handleUrlSubmit}>
            <Input
              className="h-7 min-w-0 flex-1 px-2 text-xs"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="http://localhost:3000"
            />
          </form>

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

        {/* Browser view container - native WebContentsView renders here */}
        <div ref={containerRef} className="dark:bg-background relative flex-1 bg-white">
          {!url && (
            <div className="text-muted-foreground absolute inset-0 flex items-center justify-center">
              <p className="text-sm">Enter a URL to preview</p>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default PreviewTab;
