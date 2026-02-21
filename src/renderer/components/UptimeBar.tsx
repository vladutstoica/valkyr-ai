import type { UptimeDayData } from '@/types/electron-api';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@/components/ui/hover-card';

const STATUS_COLORS: Record<UptimeDayData['status'], string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  outage: 'bg-red-500',
};

const STATUS_LABELS: Record<UptimeDayData['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function UptimeBar({ data }: { data: UptimeDayData[] }) {
  if (data.length === 0) return null;

  const operationalDays = data.filter((d) => d.status === 'operational').length;
  const uptimePercent = ((operationalDays / data.length) * 100).toFixed(1);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {data.map((day) => (
          <HoverCard key={day.date} openDelay={100} closeDelay={0}>
            <HoverCardTrigger asChild>
              <div
                className={`h-6 flex-1 rounded-[1px] transition-opacity hover:opacity-80 ${STATUS_COLORS[day.status]}`}
              />
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              className="w-auto px-2 py-1 text-[11px]"
            >
              <div className="font-medium">{formatDate(day.date)}</div>
              <div className="text-muted-foreground">
                {STATUS_LABELS[day.status]}
                {day.incidentCount > 0 && ` · ${day.incidentCount} incident${day.incidentCount > 1 ? 's' : ''}`}
              </div>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{data.length} days ago</span>
        <span>{uptimePercent}% uptime</span>
        <span>Today</span>
      </div>
    </div>
  );
}
