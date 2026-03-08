import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Folder, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';
import { Spinner } from '../ui/spinner';
import { isActivePr, type PrInfo } from '../../lib/prStatus';
import type { Task } from '../../types/app';

interface DeleteStatusEntry {
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
  error?: string;
  pr?: PrInfo | null;
}

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTasks: Task[];
  deleteStatus: Record<string, DeleteStatusEntry>;
  deleteStatusLoading: boolean;
  acknowledgeDirtyDelete: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  selectedTasks,
  deleteStatus,
  deleteStatusLoading,
  acknowledgeDirtyDelete,
  onAcknowledgeChange,
  onConfirmDelete,
  isDeleting,
}: BulkDeleteDialogProps) {
  const deleteRisks = useMemo(() => {
    const riskyIds = new Set<string>();
    const summaries: Record<string, string> = {};
    for (const ws of selectedTasks) {
      const status = deleteStatus[ws.id];
      if (!status) continue;
      const dirty =
        status.staged > 0 ||
        status.unstaged > 0 ||
        status.untracked > 0 ||
        status.ahead > 0 ||
        !!status.error ||
        (status.pr && isActivePr(status.pr));
      if (dirty) {
        riskyIds.add(ws.id);
        const parts: string[] = [];
        if (status.staged > 0)
          parts.push(`${status.staged} ${status.staged === 1 ? 'file' : 'files'} staged`);
        if (status.unstaged > 0)
          parts.push(`${status.unstaged} ${status.unstaged === 1 ? 'file' : 'files'} unstaged`);
        if (status.untracked > 0)
          parts.push(`${status.untracked} ${status.untracked === 1 ? 'file' : 'files'} untracked`);
        if (status.ahead > 0)
          parts.push(`ahead by ${status.ahead} ${status.ahead === 1 ? 'commit' : 'commits'}`);
        if (status.behind > 0)
          parts.push(`behind by ${status.behind} ${status.behind === 1 ? 'commit' : 'commits'}`);
        if (status.pr && isActivePr(status.pr)) parts.push('PR open');
        if (!parts.length && status.error) parts.push('status unavailable');
        summaries[ws.id] = parts.join(', ');
      }
    }
    return { riskyIds, summaries };
  }, [deleteStatus, selectedTasks]);

  const deleteDisabled: boolean =
    Boolean(isDeleting || deleteStatusLoading) ||
    (deleteRisks.riskyIds.size > 0 && acknowledgeDirtyDelete !== true);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete tasks?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the selected tasks and their worktrees.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {deleteStatusLoading ? (
              <motion.div
                key="bulk-delete-loading"
                initial={{ opacity: 0, y: 6, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.99 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="border-border/70 bg-muted/30 flex items-start gap-3 rounded-md border px-4 py-4"
              >
                <Spinner
                  className="text-muted-foreground mt-0.5 h-5 w-5 flex-shrink-0"
                  size="sm"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-foreground text-sm font-semibold">Please wait...</span>
                  <span className="text-muted-foreground text-xs">
                    Scanning tasks for uncommitted changes and open pull requests
                  </span>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {(() => {
              const tasksWithUncommittedWorkOnly = selectedTasks.filter((ws) => {
                const summary = deleteRisks.summaries[ws.id];
                const status = deleteStatus[ws.id];
                if (!summary && !status?.error) return false;
                if (status?.pr && isActivePr(status.pr)) return false;
                return true;
              });

              return tasksWithUncommittedWorkOnly.length > 0 && !deleteStatusLoading ? (
                <motion.div
                  key="bulk-risk"
                  initial={{ opacity: 0, y: 6, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.99 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50"
                >
                  <p className="font-medium">Unmerged or unpushed work detected</p>
                  <ul className="space-y-1">
                    {tasksWithUncommittedWorkOnly.map((ws) => {
                      const summary = deleteRisks.summaries[ws.id];
                      const status = deleteStatus[ws.id];
                      return (
                        <li
                          key={ws.id}
                          className="flex items-center gap-2 rounded-md bg-amber-50/80 px-2 py-1 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-50"
                        >
                          <Folder className="h-4 w-4 fill-amber-700 text-amber-700" />
                          <span className="font-medium">{ws.name}</span>
                          <span className="text-muted-foreground">—</span>
                          <span>{summary || status?.error || 'Status unavailable'}</span>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              ) : null;
            })()}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {deleteRisks.riskyIds.size > 0 && !deleteStatusLoading ? (
              <motion.label
                key="bulk-ack"
                className="border-border/70 bg-muted/30 flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                initial={{ opacity: 0, y: 6, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.99 }}
                transition={{ duration: 0.18, ease: 'easeOut', delay: 0.03 }}
              >
                <Checkbox
                  id="ack-delete"
                  checked={acknowledgeDirtyDelete}
                  onCheckedChange={(val) => onAcknowledgeChange(val === true)}
                />
                <span className="leading-tight">Delete tasks anyway</span>
              </motion.label>
            ) : null}
          </AnimatePresence>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4"
            onClick={onConfirmDelete}
            disabled={deleteDisabled}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
