import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, GitBranch, RefreshCw, RotateCw } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { Spinner } from './ui/spinner';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';
import type { RepoStatus, RepoUpdateResult } from '../types/electron-api';

// ============================================================================
// Types
// ============================================================================

interface UpdateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectPath: string;
  subRepos?: string[];
}

type RepoState = 'idle' | 'checking' | 'updating' | 'success' | 'error';

type FilterMode = 'all' | 'outdated';

interface RepoItemState extends RepoStatus {
  state: RepoState;
  error?: string;
  stashed?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * StatusIndicator - Displays the sync status of a repository
 */
interface StatusIndicatorProps {
  status: RepoItemState;
  className?: string;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, className }) => {
  const { state, ahead, behind, isDirty, error } = status;

  // Loading states
  if (state === 'checking') {
    return (
      <span
        className={cn('text-muted-foreground flex items-center gap-1.5 text-xs', className)}
        aria-label="Checking repository status"
      >
        <Spinner size="sm" />
        <span>Checking...</span>
      </span>
    );
  }

  if (state === 'updating') {
    return (
      <span
        className={cn('text-muted-foreground flex items-center gap-1.5 text-xs', className)}
        aria-label="Pulling latest changes"
      >
        <Spinner size="sm" />
        <span>Pulling...</span>
      </span>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <span
        className={cn('text-destructive flex items-center gap-1.5 text-xs', className)}
        aria-label={`Error: ${error || 'Failed to update'}`}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Failed</span>
      </span>
    );
  }

  // Success state (after update)
  if (state === 'success') {
    return (
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500',
          className
        )}
        aria-label="Successfully updated"
      >
        <Check className="h-3.5 w-3.5" />
        <span>Updated</span>
      </span>
    );
  }

  // Idle states - show actual status
  const isUpToDate = ahead === 0 && behind === 0;
  const isDiverged = ahead > 0 && behind > 0;

  if (isUpToDate && !isDirty) {
    return (
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500',
          className
        )}
        aria-label="Repository is up to date"
      >
        <Check className="h-3.5 w-3.5" />
        <span>Up to date</span>
      </span>
    );
  }

  if (isDiverged) {
    return (
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500',
          className
        )}
        aria-label={`Diverged: ${behind} commits behind, ${ahead} commits ahead`}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span>
          {behind}&darr; {ahead}&uarr; diverged
        </span>
      </span>
    );
  }

  if (behind > 0) {
    return (
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-500',
          className
        )}
        aria-label={`${behind} commits behind remote`}
      >
        <span>&darr;{behind} behind</span>
      </span>
    );
  }

  if (ahead > 0) {
    return (
      <span
        className={cn('text-muted-foreground flex items-center gap-1.5 text-xs', className)}
        aria-label={`${ahead} commits ahead of remote`}
      >
        <span>&uarr;{ahead} ahead</span>
      </span>
    );
  }

  return null;
};

/**
 * RepoStatusItem - Single repository row with checkbox, name, branch, and status
 */
interface RepoStatusItemProps {
  repo: RepoItemState;
  isSelected: boolean;
  onToggle: (path: string) => void;
  onRetry: (path: string) => void;
  onStashAndPull: (path: string) => void;
  disabled?: boolean;
}

const RepoStatusItem: React.FC<RepoStatusItemProps> = ({
  repo,
  isSelected,
  onToggle,
  onRetry,
  onStashAndPull,
  disabled,
}) => {
  const isUpdating = repo.state === 'updating';
  const isChecking = repo.state === 'checking';
  const hasError = repo.state === 'error';
  const isWorking = isUpdating || isChecking;

  const handleCheckboxChange = useCallback(() => {
    if (!isWorking) {
      onToggle(repo.path);
    }
  }, [onToggle, repo.path, isWorking]);

  const checkboxId = `repo-${repo.path.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <div
      className={cn(
        'border-border/50 bg-muted/20 flex flex-col gap-1 rounded-md border p-3 transition-colors',
        isSelected && 'border-border bg-muted/40',
        hasError && 'border-destructive/30 bg-destructive/5'
      )}
      role="listitem"
    >
      <div className="flex items-center gap-3">
        <Checkbox
          id={checkboxId}
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          disabled={disabled || isWorking}
          aria-label={`Select ${repo.name} for update`}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <Label
              htmlFor={checkboxId}
              className={cn(
                'cursor-pointer truncate font-medium',
                (disabled || isWorking) && 'cursor-not-allowed opacity-50'
              )}
            >
              {repo.isMainRepo ? (
                <span className="flex items-center gap-1.5">
                  <span className="bg-primary h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                  {repo.name}
                </span>
              ) : (
                repo.name
              )}
            </Label>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <GitBranch className="h-3 w-3" aria-hidden="true" />
              {repo.currentBranch}
              {repo.trackingBranch && repo.trackingBranch !== repo.currentBranch && (
                <span className="text-muted-foreground/70">&rarr; {repo.trackingBranch}</span>
              )}
            </span>
          </div>
          <StatusIndicator status={repo} />
        </div>
      </div>

      {/* Dirty repo warning */}
      {repo.isDirty && repo.state === 'idle' && (
        <div className="ml-7 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertCircle className="h-3 w-3" />
            {repo.dirtyFiles ? `${repo.dirtyFiles} uncommitted changes` : 'Uncommitted changes'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onStashAndPull(repo.path)}
            aria-label={`Stash changes and pull for ${repo.name}`}
          >
            Stash & Pull
          </Button>
        </div>
      )}

      {/* Stashed indicator */}
      {repo.stashed && repo.state === 'success' && (
        <span className="text-muted-foreground ml-7 text-xs">
          Changes were stashed before pulling
        </span>
      )}

      {/* Error with retry */}
      {hasError && repo.error && (
        <div className="ml-7 flex items-center justify-between gap-2">
          <span className="text-destructive truncate text-xs" title={repo.error}>
            {repo.error}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-xs"
            onClick={() => onRetry(repo.path)}
            aria-label={`Retry update for ${repo.name}`}
          >
            <RotateCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const UpdateProjectModal: React.FC<UpdateProjectModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectPath,
}) => {
  // State
  const [repos, setRepos] = useState<RepoItemState[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Derived state
  const filteredRepos = useMemo(() => {
    if (filterMode === 'outdated') {
      return repos.filter((r) => r.behind > 0 || r.isDirty);
    }
    return repos;
  }, [repos, filterMode]);

  const outdatedCount = useMemo(() => repos.filter((r) => r.behind > 0).length, [repos]);

  const selectedRepos = useMemo(
    () => repos.filter((r) => selectedPaths.has(r.path)),
    [repos, selectedPaths]
  );

  const hasAnyUpdating = repos.some((r) => r.state === 'updating');
  const hasAnyChecking = repos.some((r) => r.state === 'checking');
  const isWorking = hasAnyUpdating || hasAnyChecking;

  const canUpdateSelected = selectedRepos.length > 0 && !isWorking;
  const canUpdateAll = repos.length > 0 && !isWorking;

  // Fetch repo status on open
  const fetchRepoStatus = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingStatus(true);
    setGlobalError(null);

    // Set all repos to checking state
    setRepos((prev) => prev.map((r) => ({ ...r, state: 'checking' as const })));

    try {
      const result = await window.electronAPI.getProjectRepoStatus({ projectId });

      if (!result.success || !result.data) {
        setGlobalError(result.error || 'Failed to fetch repository status');
        setRepos([]);
        return;
      }

      const repoStates: RepoItemState[] = result.data.repos.map((r) => ({
        ...r,
        state: 'idle' as const,
      }));

      setRepos(repoStates);

      // Select all repos by default
      setSelectedPaths(new Set(repoStates.map((r) => r.path)));
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Failed to fetch repository status');
      setRepos([]);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [projectId]);

  // Fetch status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRepoStatus();
    } else {
      // Reset state when closing
      setRepos([]);
      setSelectedPaths(new Set());
      setFilterMode('all');
      setGlobalError(null);
    }
  }, [isOpen, fetchRepoStatus]);

  // Toggle single repo selection
  const handleToggleRepo = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Toggle select all
  const handleToggleAll = useCallback(() => {
    if (selectedPaths.size === filteredRepos.length) {
      // Deselect all
      setSelectedPaths(new Set());
    } else {
      // Select all filtered
      setSelectedPaths(new Set(filteredRepos.map((r) => r.path)));
    }
  }, [filteredRepos, selectedPaths.size]);

  // Update repos helper
  const updateRepos = useCallback(
    async (paths: string[], stashIfDirty: boolean = false) => {
      if (paths.length === 0) return;

      // Set updating state for selected repos
      setRepos((prev) =>
        prev.map((r) =>
          paths.includes(r.path) ? { ...r, state: 'updating' as const, error: undefined } : r
        )
      );

      try {
        const result = await window.electronAPI.updateProjectRepos({
          projectId,
          repoPaths: paths,
          stashIfDirty,
        });

        if (!result.success) {
          // Set error for all repos
          setRepos((prev) =>
            prev.map((r) =>
              paths.includes(r.path)
                ? { ...r, state: 'error' as const, error: result.error || 'Update failed' }
                : r
            )
          );
          return;
        }

        // Process individual results
        const resultMap = new Map<string, RepoUpdateResult>(
          (result.data || []).map((r) => [r.path, r])
        );

        setRepos((prev) =>
          prev.map((r) => {
            if (!paths.includes(r.path)) return r;

            const updateResult = resultMap.get(r.path);
            if (!updateResult) {
              return { ...r, state: 'error' as const, error: 'No result returned' };
            }

            if (updateResult.success) {
              return {
                ...r,
                state: 'success' as const,
                stashed: updateResult.stashed,
                behind: 0, // Reset behind count after successful pull
                error: undefined,
              };
            } else {
              return {
                ...r,
                state: 'error' as const,
                error: updateResult.error || 'Update failed',
              };
            }
          })
        );
      } catch (error) {
        setRepos((prev) =>
          prev.map((r) =>
            paths.includes(r.path)
              ? {
                  ...r,
                  state: 'error' as const,
                  error: error instanceof Error ? error.message : 'Update failed',
                }
              : r
          )
        );
      }
    },
    [projectId]
  );

  // Update selected repos
  const handleUpdateSelected = useCallback(() => {
    const paths = Array.from(selectedPaths);
    updateRepos(paths);
  }, [selectedPaths, updateRepos]);

  // Update all repos
  const handleUpdateAll = useCallback(() => {
    const paths = repos.map((r) => r.path);
    updateRepos(paths);
  }, [repos, updateRepos]);

  // Retry single repo
  const handleRetry = useCallback(
    (path: string) => {
      updateRepos([path]);
    },
    [updateRepos]
  );

  // Stash and pull for dirty repo
  const handleStashAndPull = useCallback(
    (path: string) => {
      updateRepos([path], true);
    },
    [updateRepos]
  );

  // All/only outdated checkboxes
  const allSelected = selectedPaths.size === filteredRepos.length && filteredRepos.length > 0;
  const someSelected = selectedPaths.size > 0 && selectedPaths.size < filteredRepos.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[80vh] max-w-lg flex-col gap-0 p-0"
        aria-labelledby="update-project-title"
        aria-describedby="update-project-description"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
          <div>
            <DialogTitle id="update-project-title">Update Project</DialogTitle>
            <DialogDescription id="update-project-description" className="sr-only">
              Pull the latest changes from remote repositories
            </DialogDescription>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleUpdateAll}
            disabled={!canUpdateAll}
            className="shrink-0"
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', hasAnyUpdating && 'animate-spin')} />
            Update All
          </Button>
        </DialogHeader>

        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-3">
            <Checkbox
              id="select-all"
              checked={allSelected}
              onCheckedChange={handleToggleAll}
              disabled={isWorking || filteredRepos.length === 0}
              aria-label={allSelected ? 'Deselect all repositories' : 'Select all repositories'}
              className={someSelected ? 'data-[state=unchecked]:bg-primary/30' : ''}
            />
            <Label htmlFor="select-all" className="cursor-pointer text-sm">
              Select all
            </Label>
          </div>

          <div
            className="flex items-center gap-2"
            role="radiogroup"
            aria-label="Filter repositories"
          >
            <button
              type="button"
              role="radio"
              aria-checked={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                filterMode === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              All
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={filterMode === 'outdated'}
              onClick={() => setFilterMode('outdated')}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                filterMode === 'outdated'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Only outdated {outdatedCount > 0 && `(${outdatedCount})`}
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          {isLoadingStatus ? (
            <div
              className="flex flex-col items-center justify-center gap-2 py-8"
              role="status"
              aria-label="Loading repository status"
            >
              <Spinner size="lg" />
              <span className="text-muted-foreground text-sm">Checking repositories...</span>
            </div>
          ) : globalError ? (
            <div
              className="flex flex-col items-center justify-center gap-3 py-8"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="text-destructive h-8 w-8" />
              <span className="text-destructive text-sm">{globalError}</span>
              <Button variant="outline" size="sm" onClick={fetchRepoStatus}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <span className="text-muted-foreground text-sm">
                {filterMode === 'outdated'
                  ? 'All repositories are up to date'
                  : 'No repositories found'}
              </span>
            </div>
          ) : (
            <div
              className="flex flex-col gap-2"
              role="list"
              aria-label="Repository list"
              aria-live="polite"
            >
              {filteredRepos.map((repo) => (
                <RepoStatusItem
                  key={repo.path}
                  repo={repo}
                  isSelected={selectedPaths.has(repo.path)}
                  onToggle={handleToggleRepo}
                  onRetry={handleRetry}
                  onStashAndPull={handleStashAndPull}
                  disabled={false}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={isWorking}>
            Cancel
          </Button>
          <Button onClick={handleUpdateSelected} disabled={!canUpdateSelected}>
            Update Selected ({selectedPaths.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateProjectModal;
