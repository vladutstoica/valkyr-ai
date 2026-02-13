import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUpRight, Pencil, Pin, PinOff, MoreVertical, Archive, Trash2, GitBranch } from 'lucide-react';
import { usePrStatus } from '../hooks/usePrStatus';
import { useTaskBusy } from '../hooks/useTaskBusy';
import { useTaskIdle } from '../hooks/useTaskIdle';
import PrPreviewTooltip from './PrPreviewTooltip';
import { normalizeTaskName, MAX_TASK_NAME_LENGTH } from '../lib/taskNames';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';

function stopPropagation(e: React.MouseEvent): void {
  e.stopPropagation();
}

interface Task {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
  useWorktree?: boolean;
}

interface TaskItemProps {
  task: Task;
  onDelete?: () => void | Promise<void | boolean>;
  onRename?: (newName: string) => void | Promise<void>;
  onArchive?: () => void | Promise<void | boolean>;
  onPin?: () => void | Promise<void>;
  isPinned?: boolean;
  showDelete?: boolean;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onDelete,
  onRename,
  onArchive,
  onPin,
  isPinned,
  showDelete,
}) => {
  const { pr } = usePrStatus(task.path);
  const isRunning = useTaskBusy(task.id);
  const isIdle = useTaskIdle(task.id);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);

  const handleConfirmDelete = useCallback(async () => {
    if (!onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete();
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [onDelete]);

  const handleStartEdit = useCallback(() => {
    if (!onRename) return;
    setEditValue(task.name);
    isSubmittingRef.current = false;
    setIsEditing(true);
  }, [onRename, task.name]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(task.name);
  }, [task.name]);

  const handleConfirmEdit = useCallback(async () => {
    // Prevent double calls from Enter + blur
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const normalized = normalizeTaskName(editValue);
    if (!normalized) {
      handleCancelEdit();
      return;
    }
    if (normalized === normalizeTaskName(task.name)) {
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    await onRename?.(normalized);
  }, [editValue, task.name, onRename, handleCancelEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleConfirmEdit, handleCancelEdit]
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Small delay to ensure context menu has closed and input is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  const taskContent = (
    <div className="flex min-w-0 items-center justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2 py-1">
        {/* Status dot indicator */}
        {isRunning || task.status === 'running' ? (
          // Amber dot - agent in progress
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500 animate-pulse" title="In progress" />
        ) : isIdle ? (
          // Red dot - agent needs user input
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" title="Needs input" />
        ) : (
          // Green dot - work done / inactive
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" title="Done" />
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleConfirmEdit}
            maxLength={MAX_TASK_NAME_LENGTH}
            className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-foreground outline-hidden focus:border-ring focus:ring-1 focus:ring-ring"
            onClick={stopPropagation}
          />
        ) : (
          <>
            {isPinned && <Pin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
            {task.useWorktree !== false && (
              <span title="Running in worktree">
                <GitBranch className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              </span>
            )}
            <span className="block truncate text-xs font-medium text-foreground">{task.name}</span>
          </>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {showDelete && (onDelete || onRename || onArchive || onPin) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 cursor-pointer text-muted-foreground ${
                  isDeleting ? '' : 'opacity-0 group-hover/task:opacity-100'
                }`}
                onClick={stopPropagation}
                disabled={isDeleting}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stopPropagation}>
              {onPin && (
                <DropdownMenuItem className="cursor-pointer" onClick={() => onPin()}>
                  {isPinned ? (
                    <>
                      <PinOff className="mr-2 h-3.5 w-3.5" />
                      Unpin
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-3.5 w-3.5" />
                      Pin
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {onRename && (
                <DropdownMenuItem className="cursor-pointer" onClick={() => handleStartEdit()}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
              )}
              {onArchive && (
                <DropdownMenuItem className="cursor-pointer" onClick={() => onArchive()}>
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  Archive
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {pr ? (
          <PrPreviewTooltip pr={pr} side="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (pr.url) window.electronAPI.openExternal(pr.url);
              }}
              className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title={`${pr.title || 'Pull Request'} (#${pr.number})`}
            >
              {pr.isDraft
                ? 'Draft'
                : String(pr.state).toUpperCase() === 'OPEN'
                  ? 'View PR'
                  : `PR ${String(pr.state).charAt(0).toUpperCase() + String(pr.state).slice(1).toLowerCase()}`}
              <ArrowUpRight className="size-3" />
            </button>
          </PrPreviewTooltip>
        ) : null}
      </div>
    </div>
  );

  const deleteDialog = (
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete session</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{task.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirmDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Wrap with context menu if rename, archive, delete, or pin is available
  if (onRename || onArchive || onPin || onDelete) {
    return (
      <>
        {deleteDialog}
        <ContextMenu>
          <ContextMenuTrigger asChild>{taskContent}</ContextMenuTrigger>
          <ContextMenuContent>
            {onPin && (
              <ContextMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                }}
              >
                {isPinned ? (
                  <>
                    <PinOff className="mr-2 h-3.5 w-3.5" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="mr-2 h-3.5 w-3.5" />
                    Pin
                  </>
                )}
              </ContextMenuItem>
            )}
            {onRename && (
              <ContextMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit();
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </ContextMenuItem>
            )}
            {onArchive && (
              <ContextMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
              >
                <Archive className="mr-2 h-3.5 w-3.5" />
                Archive
              </ContextMenuItem>
            )}
            {onDelete && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </>
    );
  }

  return (
    <>
      {deleteDialog}
      {taskContent}
    </>
  );
};
