import { CheckCircle2, XCircle, Loader2, MinusCircle, ExternalLink } from 'lucide-react';
import githubIcon from '../../assets/images/github.png';
import type { CheckRunsStatus, CheckRun, CheckRunBucket } from '../lib/checkRunStatus';
import { formatCheckDuration } from '../lib/checkRunStatus';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

function BucketIcon({ bucket }: { bucket: CheckRunBucket }) {
  switch (bucket) {
    case 'pass':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'fail':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'pending':
      return <span className="inline-block h-3.5 w-3.5 rounded-full bg-amber-500" />;
    case 'skipping':
    case 'cancel':
      return <MinusCircle className="text-muted-foreground/60 h-3.5 w-3.5" />;
  }
}

function CheckRunItem({ check }: { check: CheckRun }) {
  const duration = formatCheckDuration(check.startedAt, check.completedAt);

  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="shrink-0">
        <BucketIcon bucket={check.bucket} />
      </span>
      <img src={githubIcon} alt="" className="h-3.5 w-3.5 shrink-0 dark:invert" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-sm">{check.name}</div>
        {check.workflow && (
          <div className="text-muted-foreground truncate text-xs">{check.workflow}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {duration && <span className="text-muted-foreground text-xs">{duration}</span>}
        {check.link && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Open in GitHub"
            onClick={() => check.link && window.electronAPI?.openExternal?.(check.link)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ChecksPanelProps {
  status: CheckRunsStatus | null;
  isLoading: boolean;
  hasPr: boolean;
  hideSummary?: boolean;
}

export function ChecksPanel({ status, isLoading, hasPr, hideSummary }: ChecksPanelProps) {
  if (!hasPr) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted-foreground text-sm">No PR exists for this branch.</p>
      </div>
    );
  }

  if (isLoading && !status) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!status || !status.checks || status.checks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground text-sm">No CI checks found for this repository</p>
        </div>
      </div>
    );
  }

  const { summary } = status;

  return (
    <div className="flex flex-col">
      {!hideSummary && (
        <div className="border-border flex items-center gap-1.5 border-b px-4 py-2">
          {summary.passed > 0 && (
            <Badge variant="outline">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              {summary.passed} passed
            </Badge>
          )}
          {summary.failed > 0 && (
            <Badge variant="outline">
              <XCircle className="h-3 w-3 text-red-500" />
              {summary.failed} failed
            </Badge>
          )}
          {summary.pending > 0 && (
            <Badge variant="outline">
              <Loader2 className="h-3 w-3 animate-spin" />
              {summary.pending} pending
            </Badge>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status.checks.map((check, i) => (
          <CheckRunItem key={`${check.name}-${i}`} check={check} />
        ))}
      </div>
    </div>
  );
}
