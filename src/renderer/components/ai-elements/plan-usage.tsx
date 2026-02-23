import type { ClaudeUsageLimits, ClaudeUsageBucket } from '@/types/electron-api';
import { type ComponentProps, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Helpers ──

function formatTimeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function utilizationColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function utilizationTextColor(pct: number): string {
  if (pct >= 80) return 'text-red-400';
  if (pct >= 50) return 'text-amber-400';
  return 'text-muted-foreground';
}

function utilizationStrokeColor(pct: number): string {
  if (pct >= 80) return '#ef4444';
  if (pct >= 50) return '#f59e0b';
  return '#10b981';
}

// ── UsageRow ──

function UsageRow({ label, bucket }: { label: string; bucket: ClaudeUsageBucket }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn('w-9 text-right tabular-nums font-medium', utilizationTextColor(bucket.utilization))}>
            {Math.round(bucket.utilization)}%
          </span>
          <span className={cn('w-14 text-right text-[10px] tabular-nums text-muted-foreground/70', !bucket.resets_at && 'invisible')}>
            {bucket.resets_at ? formatTimeUntil(bucket.resets_at) : '—'}
          </span>
        </div>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn('h-full rounded-full transition-all', utilizationColor(bucket.utilization))}
          style={{ width: `${Math.min(bucket.utilization, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Hook ──

const POLL_INTERVAL = 60_000;

export function useClaudeUsageLimits(providerId: string) {
  const [limits, setLimits] = useState<ClaudeUsageLimits | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetch = useCallback(async () => {
    if (providerId !== 'claude') return;
    try {
      const result = await window.electronAPI.acpGetClaudeUsageLimits();
      if (result.success && result.data) {
        setLimits(result.data);
      }
    } catch {
      // Silently fail — usage limits are optional
    }
  }, [providerId]);

  useEffect(() => {
    fetch();
    intervalRef.current = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetch]);

  return limits;
}

// ── Compact trigger (for toolbar) ──

export type PlanUsageTriggerProps = ComponentProps<'button'> & {
  limits: ClaudeUsageLimits;
};

export const PlanUsageTrigger = forwardRef<HTMLButtonElement, PlanUsageTriggerProps>(
  function PlanUsageTrigger({ limits, className, ...props }, ref) {
    // Show the current session (5-hour) bucket as the compact indicator
    const bucket = limits.fiveHour;
    if (!bucket) return null;

    return (
      <button
        ref={ref}
        type="button"
        title="Plan usage"
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-accent transition-colors',
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-1">
          <div className="relative size-3.5">
            <svg viewBox="0 0 16 16" className="size-3.5">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
              <circle
                cx="8" cy="8" r="6" fill="none" strokeWidth="2"
                stroke={utilizationStrokeColor(bucket.utilization)}
                strokeDasharray={`${2 * Math.PI * 6} ${2 * Math.PI * 6}`}
                strokeDashoffset={2 * Math.PI * 6 * (1 - bucket.utilization / 100)}
                strokeLinecap="round"
                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
              />
            </svg>
          </div>
          <span className="tabular-nums font-medium">{Math.round(bucket.utilization)}%</span>
        </div>
      </button>
    );
  },
);

// ── Popover content (full breakdown) ──

export type PlanUsageContentProps = ComponentProps<'div'> & {
  limits: ClaudeUsageLimits;
};

export function PlanUsageContent({ limits, className, ...props }: PlanUsageContentProps) {
  return (
    <div className={cn('w-56 space-y-2 p-3', className)} {...props}>
      <p className="pb-2 border-b border-border text-xs font-medium">Plan usage</p>
      {limits.fiveHour && <UsageRow label="Session" bucket={limits.fiveHour} />}
      {limits.sevenDay && <UsageRow label="Weekly" bucket={limits.sevenDay} />}
      {limits.sevenDaySonnet && <UsageRow label="Sonnet" bucket={limits.sevenDaySonnet} />}
      {limits.sevenDayOpus && <UsageRow label="Opus" bucket={limits.sevenDayOpus} />}
      {limits.extraUsage && limits.extraUsage.is_enabled && (
        <UsageRow
          label="Extra credits"
          bucket={{
            utilization: limits.extraUsage.utilization,
            resets_at: null,
          }}
        />
      )}
    </div>
  );
}

// ── Hover card wrapper ──

export type PlanUsageHoverCardProps = {
  limits: ClaudeUsageLimits;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
};

export function PlanUsageHoverCard({ limits, side = 'bottom', align = 'end' }: PlanUsageHoverCardProps) {
  return (
    <HoverCard closeDelay={0} openDelay={200}>
      <HoverCardTrigger asChild>
        <PlanUsageTrigger limits={limits} />
      </HoverCardTrigger>
      <HoverCardContent className="w-auto p-0" side={side} align={align}>
        <PlanUsageContent limits={limits} />
      </HoverCardContent>
    </HoverCard>
  );
}
