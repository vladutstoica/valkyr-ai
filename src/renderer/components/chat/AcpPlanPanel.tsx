import React from 'react';
import { Streamdown } from 'streamdown';
import {
  CheckCircleIcon,
  ClockIcon,
  ListPlusIcon,
  Loader2,
  XIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import type { AcpPlanEntry } from '../../lib/acpChatTransport';
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanTrigger,
  PlanContent,
  PlanFooter,
} from '../ai-elements/plan';
import {
  QueueList,
  QueueItem,
  QueueItemContent,
} from '../ai-elements/queue';

interface PendingPlanApproval {
  toolCallId: string;
  content: string | null;
  fromMode?: string;
  toMode?: string;
}

interface AcpPlanPanelProps {
  planEntries: AcpPlanEntry[];
  pendingPlanApproval: PendingPlanApproval | null;
  planDismissed: boolean;
  planOpen: boolean;
  isStreaming: boolean;
  onPlanOpenChange: (open: boolean) => void;
  onDismiss: () => void;
  onUndismiss: () => void;
}

export function AcpPlanPanel({
  planEntries,
  pendingPlanApproval,
  planDismissed,
  planOpen,
  isStreaming,
  onPlanOpenChange,
  onDismiss,
  onUndismiss,
}: AcpPlanPanelProps) {
  const hasContent = planEntries.length > 0 || pendingPlanApproval;
  if (!hasContent) return null;

  if (planDismissed) {
    return (
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 border-border/50 flex w-full shrink-0 items-center justify-center gap-1.5 border-b px-3 py-1 text-xs transition-colors"
        onClick={onUndismiss}
      >
        <ListPlusIcon className="size-3" />
        Show last plan
      </button>
    );
  }

  return (
    <div className="border-border/50 shrink-0 border-b px-3 py-2">
      <Plan isStreaming={isStreaming} open={planOpen} onOpenChange={onPlanOpenChange}>
        <PlanHeader>
          <div>
            <div className="flex items-center gap-2">
              <PlanTitle>
                {pendingPlanApproval ? 'Plan ready for review' : 'Agent Plan'}
              </PlanTitle>
              {planEntries.length > 0 && !pendingPlanApproval && (
                <PlanDescription>
                  {planEntries.filter((e) => e.status === 'completed').length}/
                  {planEntries.length} completed
                </PlanDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <PlanTrigger />
            {!pendingPlanApproval && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
                onClick={onDismiss}
                title="Dismiss plan"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
        </PlanHeader>
        <PlanContent className="mt-2">
          {/* Plan preview content from ExitPlanMode */}
          {pendingPlanApproval?.content &&
            pendingPlanApproval.content !== 'Loading plan...' && (
              <div className="border-border/50 bg-muted/30 mb-2 max-h-80 overflow-y-auto rounded border p-3 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <Streamdown shikiTheme={['github-light', 'github-dark']}>
                  {pendingPlanApproval.content}
                </Streamdown>
              </div>
            )}
          {pendingPlanApproval?.content === 'Loading plan...' && (
            <div className="border-border/50 bg-muted/30 mb-2 flex items-center gap-2 rounded border p-3 text-sm">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
              <span className="text-muted-foreground">Loading plan...</span>
            </div>
          )}
          {/* Mode switch heading — after plan content, before approve/reject */}
          {pendingPlanApproval?.fromMode && (
            <p className="mt-2 mb-0 text-sm font-medium">
              Switch from <strong>{pendingPlanApproval.fromMode}</strong> to{' '}
              <strong>{pendingPlanApproval.toMode || 'code'}</strong> mode?
            </p>
          )}
          {/* Task entries using Queue components */}
          {planEntries.length > 0 && (
            <QueueList className="mt-0 -mb-0">
              {planEntries.map((entry, i) => (
                <QueueItem key={i} className="px-0 py-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0">
                      {entry.status === 'completed' ? (
                        <CheckCircleIcon className="size-3.5 text-green-500" />
                      ) : entry.status === 'in_progress' ? (
                        <Loader2 className="text-primary size-3.5 animate-spin" />
                      ) : (
                        <ClockIcon className="text-muted-foreground size-3.5" />
                      )}
                    </span>
                    <QueueItemContent completed={entry.status === 'completed'}>
                      {entry.content}
                    </QueueItemContent>
                    {entry.priority === 'high' && (
                      <span className="ml-auto shrink-0 rounded bg-red-500/15 px-1 text-[10px] text-red-400">
                        high
                      </span>
                    )}
                  </div>
                </QueueItem>
              ))}
            </QueueList>
          )}
        </PlanContent>
        {/* Approve/Reject footer when ExitPlanMode awaits approval */}
        {pendingPlanApproval && (
          <PlanFooter className="mt-2 justify-between border-t pt-2">
            <span className="text-muted-foreground/60 text-xs">
              <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{' '}
              to approve
              {' \u00b7 '}
              <kbd className="border-border/50 bg-muted/50 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>{' '}
              to reject
            </span>
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                data-tool-call-id={pendingPlanApproval.toolCallId}
                data-action="deny"
              >
                Reject
              </Button>
              <Button
                size="sm"
                data-tool-call-id={pendingPlanApproval.toolCallId}
                data-action="approve"
              >
                Approve
              </Button>
            </span>
          </PlanFooter>
        )}
      </Plan>
    </div>
  );
}
