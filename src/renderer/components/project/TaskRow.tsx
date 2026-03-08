import React, { useEffect, useState } from 'react';
import { GitBranch, ArrowUpRight, Archive } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Checkbox } from '../ui/checkbox';
import { usePrStatus } from '../../hooks/usePrStatus';
import { useTaskChanges } from '../../hooks/useTaskChanges';
import { ChangesBadge } from './TaskChanges';
import { Spinner } from '../ui/spinner';
import { TaskDeleteButton } from './TaskDeleteButton';
import { activityStore } from '../../lib/activityStore';
import type { Task } from '../../types/app';
import { openExternal } from '../../services/shellService';

export const TaskRow = React.memo(function TaskRow({
  ws,
  active,
  onClick,
  onDelete,
  onArchive,
  isSelectMode,
  isSelected,
  onToggleSelect,
}: {
  ws: Task;
  active: boolean;
  onClick: () => void;
  onDelete: () => void | Promise<void | boolean>;
  onArchive?: () => void | Promise<void | boolean>;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { pr } = usePrStatus(ws.path);
  const { totalAdditions, totalDeletions, isLoading } = useTaskChanges(ws.path, ws.id);

  useEffect(() => {
    const off = activityStore.subscribe(ws.id, (busy) => setIsRunning(busy));
    return () => {
      off?.();
    };
  }, [ws.id]);

  const handleRowClick = () => {
    if (!isSelectMode) {
      onClick();
    }
  };

  return (
    <div className={['bg-background overflow-hidden rounded-xl border', 'border-border'].join(' ')}>
      <div
        onClick={handleRowClick}
        role="button"
        tabIndex={0}
        className={[
          'group flex items-start justify-between gap-3 rounded-t-xl',
          'hover:bg-muted/40 px-4 py-3 transition-all hover:shadow-xs',
          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-hidden',
        ].join(' ')}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-base leading-tight font-medium tracking-tight">{ws.name}</div>
          </div>
          <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-2 text-xs">
            {isRunning || ws.status === 'running' ? <Spinner size="sm" className="size-3" /> : null}
            <GitBranch className="size-3" />
            <span className="max-w-[24rem] truncate font-mono" title={`origin/${ws.branch}`}>
              origin/{ws.branch}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isLoading && (totalAdditions > 0 || totalDeletions > 0) ? (
            <ChangesBadge additions={totalAdditions} deletions={totalDeletions} />
          ) : null}

          {!isLoading && totalAdditions === 0 && totalDeletions === 0 && pr ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (pr.url) openExternal(pr.url);
              }}
              className="border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors"
              title={`${pr.title || 'Pull Request'} (#${pr.number})`}
            >
              {pr.isDraft
                ? 'Draft'
                : String(pr.state).toUpperCase() === 'OPEN'
                  ? 'View PR'
                  : `PR ${String(pr.state).charAt(0).toUpperCase() + String(pr.state).slice(1).toLowerCase()}`}
              <ArrowUpRight className="size-3" />
            </button>
          ) : null}

          {isSelectMode ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.()}
              aria-label={`Select ${ws.name}`}
              className="border-muted-foreground/50 data-[state=checked]:border-muted-foreground data-[state=checked]:bg-muted-foreground h-4 w-4 rounded"
            />
          ) : (
            <>
              {onArchive && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground inline-flex items-center justify-center rounded p-2 hover:bg-transparent focus-visible:ring-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive();
                        }}
                        aria-label={`Archive task ${ws.name}`}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Archive Task
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TaskDeleteButton
                taskName={ws.name}
                taskId={ws.id}
                taskPath={ws.path}
                useWorktree={ws.useWorktree}
                onConfirm={async () => {
                  try {
                    setIsDeleting(true);
                    await onDelete();
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                isDeleting={isDeleting}
                aria-label={`Delete task ${ws.name}`}
                className="text-muted-foreground inline-flex items-center justify-center rounded p-2 hover:bg-transparent focus-visible:ring-0"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
});
