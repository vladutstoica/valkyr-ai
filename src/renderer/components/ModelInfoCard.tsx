import { useModelMetadata } from '@/hooks/useModelMetadata';
import { UptimeBar } from './UptimeBar';
import { Separator } from '@/components/ui/separator';

type ModelInfoCardProps = {
  modelId: string;
  providerId: string;
  providerName: string;
  modelName: string;
  providerIcon?: string;
  invertIconInDark?: boolean;
};

function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  if (price < 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return count.toLocaleString();
}

const STATUS_DOT: Record<string, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  partial_outage: 'bg-amber-500',
  major_outage: 'bg-red-500',
};

const STATUS_LABEL: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial_outage: 'Partial Outage',
  major_outage: 'Major Outage',
};

export function ModelInfoCard({
  modelId,
  providerId,
  providerName,
  modelName,
  providerIcon,
  invertIconInDark,
}: ModelInfoCardProps) {
  const { metadata, uptimeData, providerStatus, loading } = useModelMetadata(
    modelId,
    providerId
  );

  if (loading) {
    return (
      <div className="w-[260px] border-l border-border bg-muted/30 p-3 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-2 w-full animate-pulse rounded bg-muted" />
        <div className="h-2 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="w-[260px] border-l border-border bg-muted/30 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2">
        {providerIcon && (
          <img
            src={providerIcon}
            alt={providerName}
            className={`size-4 rounded-sm ${invertIconInDark ? 'dark:invert' : ''}`}
          />
        )}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{providerName}</div>
          <div className="text-xs font-medium truncate">{metadata?.name ?? modelName}</div>
        </div>
      </div>

      {/* Description */}
      {metadata?.description && (
        <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
          {metadata.description}
        </p>
      )}

      {/* Stats */}
      {metadata && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <InfoRow label="Context" value={`${formatTokenCount(metadata.contextLength)} tokens`} />
            <Separator />
            <InfoRow
              label="Input pricing"
              value={`${formatPrice(metadata.pricing.input)} / M tokens`}
            />
            <Separator />
            <InfoRow
              label="Output pricing"
              value={`${formatPrice(metadata.pricing.output)} / M tokens`}
            />
          </div>
        </>
      )}

      {/* Provider status */}
      {providerStatus && (
        <>
          <Separator />
          <div className="flex items-center gap-1.5">
            <div
              className={`size-1.5 rounded-full ${STATUS_DOT[providerStatus.status] ?? 'bg-muted-foreground'}`}
            />
            <span className="text-[11px] text-muted-foreground">
              {STATUS_LABEL[providerStatus.status] ?? providerStatus.status}
            </span>
          </div>
        </>
      )}

      {/* Uptime bar */}
      {uptimeData.length > 0 && (
        <>
          <Separator />
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Uptime</div>
            <UptimeBar data={uptimeData} />
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
