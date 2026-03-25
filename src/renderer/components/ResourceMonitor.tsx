import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Separator } from './ui/separator';
import { cn } from '../lib/utils';
import type { ResourceMetrics, ResourceProcessInfo } from '../types/electron-api';

const POLL_INTERVAL_MS = 5000;

/** Map Electron process types to friendly labels */
function processTypeLabel(type: string): string {
  switch (type) {
    case 'Browser':
      return 'Main';
    case 'Tab':
      return 'Renderer';
    default:
      return type;
  }
}

/** Format memory in MB or GB */
function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export const ResourceMonitor: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<ResourceMetrics | null>(null);
  const [processesExpanded, setProcessesExpanded] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const result = await window.electronAPI.getResourceMetrics();
      if (result.success && result.data) {
        setMetrics(result.data);
      }
    } catch {
      // silent
    }
  }, []);

  // Fetch once on mount for the status bar badge
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Poll while popover is open
  useEffect(() => {
    if (open) {
      fetchMetrics();
      intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, fetchMetrics]);

  // Group processes by type for display
  const groupedProcesses = metrics?.processes.reduce<Record<string, ResourceProcessInfo[]>>(
    (acc, p) => {
      const label = processTypeLabel(p.type);
      if (!acc[label]) acc[label] = [];
      acc[label].push(p);
      return acc;
    },
    {}
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
            'hover:text-foreground focus-visible:ring-ring focus:outline-none focus-visible:ring-1'
          )}
        >
          <Cpu className="h-3 w-3" />
          <span>{metrics ? formatMemory(metrics.totalMemory) : '--'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Resource Usage
          </span>
          <button
            onClick={fetchMetrics}
            className="text-muted-foreground hover:text-foreground rounded-sm p-0.5 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* Summary stats */}
        {metrics && (
          <div className="grid grid-cols-3 gap-2 px-3 py-2">
            <div>
              <div className="text-muted-foreground text-[9px] font-semibold uppercase">CPU</div>
              <div className="text-xs font-medium">{metrics.totalCpu.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[9px] font-semibold uppercase">Memory</div>
              <div className="text-xs font-medium">{formatMemory(metrics.totalMemory)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[9px] font-semibold uppercase">
                RAM Share
              </div>
              <div className="text-xs font-medium">{metrics.ramShare}%</div>
            </div>
          </div>
        )}

        <Separator />

        {/* Process breakdown */}
        {metrics && groupedProcesses && (
          <div className="px-1 py-1">
            <button
              onClick={() => setProcessesExpanded((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase transition-colors"
            >
              {processesExpanded ? (
                <ChevronDown className="h-2.5 w-2.5" />
              ) : (
                <ChevronRight className="h-2.5 w-2.5" />
              )}
              Processes ({metrics.processes.length})
            </button>

            {processesExpanded && (
              <div className="mt-0.5 space-y-px">
                {Object.entries(groupedProcesses).map(([label, procs]) => (
                  <div key={label}>
                    {procs.map((p) => (
                      <div
                        key={p.pid}
                        className="flex items-center justify-between px-2 py-0.5 text-xs"
                      >
                        <span className="text-muted-foreground truncate">
                          {label}
                          {procs.length > 1
                            ? ` (${p.name !== p.type ? p.name : `PID ${p.pid}`})`
                            : ''}
                        </span>
                        <div className="flex items-center gap-3 text-[10px] tabular-nums">
                          <span>{p.cpu.toFixed(1)}%</span>
                          <span className="w-16 text-right">{formatMemory(p.memory)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!metrics && (
          <div className="text-muted-foreground py-4 text-center text-xs">Loading...</div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ResourceMonitor;
