import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  GitBranch,
  FileCode,
  Copy,
  Search,
  Check,
  Loader2,
  RefreshCw,
  ArrowUpFromLine,
  ChevronRight,
} from 'lucide-react';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { toast } from '../../hooks/use-toast';
import type { BranchInfo, RepoBranchesResult } from '@/types/electron-api';
import type { SubRepo } from '@/types/app';

/** Filter out internal worktree pool branches */
const isReserveBranch = (name: string) => name.startsWith('_reserve/');

export interface StatusBarProps {
  agentStatus: 'idle' | 'working' | 'error' | 'waiting';
  agentName: string;
  baseBranch: string;
  currentBranch: string;
  commitsBehind: number;
  commitsAhead: number;
  changesCount: number;
  worktreeId: string;
  worktreePath: string;
  taskPath?: string;
  projectId?: string;
  subRepos?: SubRepo[] | null;
  onAgentClick?: () => void;
  onChangesClick?: () => void;
  onBranchChange?: () => void;
}

const statusColors: Record<StatusBarProps['agentStatus'], string> = {
  idle: 'bg-green-500',
  working: 'bg-amber-500 animate-pulse',
  error: 'bg-red-500',
  waiting: 'bg-red-500',
};

const statusLabels: Record<StatusBarProps['agentStatus'], string> = {
  idle: 'Idle',
  working: 'Working',
  error: 'Error',
  waiting: 'Waiting for input',
};

// ─── Per-repo branch switcher sub-popover ─────────────────────────────

interface RepoBranchPopoverProps {
  repoPath: string;
  repoName: string;
  currentBranch: string;
  onBranchSwitched: (newBranch: string) => void;
}

const RepoBranchPopover: React.FC<RepoBranchPopoverProps> = ({
  repoPath,
  repoName,
  currentBranch,
  onBranchSwitched,
}) => {
  const [open, setOpen] = useState(false);
  const [branchData, setBranchData] = useState<RepoBranchesResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setBranchData(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    window.electronAPI
      .getRepoBranches({ repoPath })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) setBranchData(result.data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      cancelled = true;
    };
  }, [open, repoPath]);

  const filtered = useMemo(() => {
    if (!branchData) return null;
    const q = searchQuery.toLowerCase();
    const filterBranch = (b: { name: string }) =>
      !isReserveBranch(b.name) && (!q || b.name.toLowerCase().includes(q));
    return {
      ...branchData,
      recent: branchData.recent.filter((n) => !isReserveBranch(n) && (!q || n.toLowerCase().includes(q))),
      local: branchData.local.filter(filterBranch),
      remote: branchData.remote.filter(filterBranch),
    };
  }, [branchData, searchQuery]);

  const handleSwitch = useCallback(
    async (branchName: string, isRemote: boolean) => {
      const effectiveCurrent = branchData?.current || currentBranch;
      if (branchName === effectiveCurrent) {
        setOpen(false);
        return;
      }
      const target = isRemote ? branchName.replace(/^origin\//, '') : branchName;
      setSwitchingBranch(target);
      try {
        const result = await window.electronAPI.switchRepoBranch({
          repoPath,
          branch: target,
          stashIfDirty: true,
        });
        if (result.success) {
          toast({
            title: 'Branch switched',
            description: `${repoName}: switched to ${target}${result.stashed ? ' (stashed)' : ''}`,
          });
          onBranchSwitched(target);
          setOpen(false);
        } else {
          toast({ title: 'Failed to switch branch', description: result.error || 'Unknown error', variant: 'destructive' });
        }
      } catch (error) {
        toast({ title: 'Failed to switch branch', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
      } finally {
        setSwitchingBranch(null);
      }
    },
    [repoPath, repoName, branchData, currentBranch, onBranchSwitched]
  );

  const renderItem = (branch: BranchInfo | { name: string }, isRemote: boolean) => {
    const effectiveCurrent = branchData?.current || currentBranch;
    const isCurrent = branch.name === effectiveCurrent || branch.name === `origin/${effectiveCurrent}`;
    const isBeingSwitched = switchingBranch === branch.name || switchingBranch === branch.name.replace(/^origin\//, '');

    return (
      <button
        key={branch.name}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-xs',
          'hover:bg-accent focus:bg-accent focus:outline-hidden',
          switchingBranch && !isBeingSwitched && 'pointer-events-none opacity-50'
        )}
        onClick={() => handleSwitch(branch.name, isRemote)}
        disabled={!!switchingBranch}
      >
        <div className="flex items-center gap-1.5 truncate">
          {isBeingSwitched ? (
            <Loader2 className="text-muted-foreground h-3 w-3 flex-shrink-0 animate-spin" />
          ) : (
            <GitBranch className="text-muted-foreground h-3 w-3 flex-shrink-0" />
          )}
          <span className="truncate">{branch.name}</span>
        </div>
        {isCurrent && <Check className="h-3 w-3 flex-shrink-0 text-green-600 dark:text-green-400" />}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
            'hover:bg-accent focus:bg-accent focus:outline-hidden'
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            <GitBranch className="text-muted-foreground h-3 w-3 flex-shrink-0" />
            <span className="truncate font-medium">{repoName}</span>
            <span className="text-muted-foreground truncate">{currentBranch}</span>
          </div>
          <ChevronRight className="text-muted-foreground h-3 w-3 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" sideOffset={4} align="start" className="w-64 p-0" collisionPadding={8}>
        <div className="px-2 pt-2 pb-1">
          <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            {repoName}
          </div>
        </div>
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="placeholder:text-muted-foreground focus:ring-ring h-7 w-full rounded-sm border bg-transparent pr-2 pl-7 text-xs outline-none focus:ring-1"
            />
          </div>
        </div>
        <Separator />
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          </div>
        )}
        {!isLoading && filtered && (
          <ScrollArea className="max-h-[250px]">
            <div className="p-1">
              {filtered.recent.length > 0 && (
                <div className="space-y-0.5">
                  <div className="text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                    Recent
                  </div>
                  {filtered.recent.map((name) => {
                    const branch = filtered.local.find((b) => b.name === name) || { name };
                    return renderItem(branch, false);
                  })}
                </div>
              )}
              {filtered.local.length > 0 && (
                <>
                  {filtered.recent.length > 0 && <Separator className="my-1" />}
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                      Local
                    </div>
                    {filtered.local.map((branch) => renderItem(branch, false))}
                  </div>
                </>
              )}
              {filtered.remote.length > 0 && (
                <>
                  {(filtered.recent.length > 0 || filtered.local.length > 0) && (
                    <Separator className="my-1" />
                  )}
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                      Remote
                    </div>
                    {filtered.remote.map((branch) => renderItem(branch, true))}
                  </div>
                </>
              )}
              {filtered.recent.length === 0 && filtered.local.length === 0 && filtered.remote.length === 0 && (
                <div className="text-muted-foreground py-4 text-center text-xs">
                  {searchQuery.trim() ? 'No branches found' : 'No branches available'}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
};

// ─── Main StatusBar ───────────────────────────────────────────────────

export const StatusBar: React.FC<StatusBarProps> = ({
  agentStatus,
  agentName,
  baseBranch,
  currentBranch,
  commitsBehind,
  commitsAhead,
  changesCount,
  worktreeId,
  worktreePath,
  taskPath,
  projectId,
  subRepos,
  onAgentClick,
  onChangesClick,
  onBranchChange,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [branchData, setBranchData] = useState<RepoBranchesResult | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [repoBranchOverrides, setRepoBranchOverrides] = useState<Record<string, string>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The effective path: taskPath (worktree) or worktreePath (project path)
  const effectivePath = taskPath || worktreePath || undefined;

  // Repos list
  const repos = useMemo(() => {
    if (subRepos && subRepos.length > 0) {
      return subRepos.map((r) => ({
        name: r.name,
        path: r.path,
        branch: r.gitInfo?.branch || 'unknown',
      }));
    }
    if (effectivePath) {
      return [{ name: '(root)', path: effectivePath, branch: currentBranch }];
    }
    return [];
  }, [subRepos, effectivePath, currentBranch]);

  const isMultiRepo = repos.length > 1;
  const allRepoPaths = useMemo(() => repos.map((r) => r.path), [repos]);

  // Clear branch overrides when project changes
  useEffect(() => {
    setRepoBranchOverrides({});
  }, [subRepos, effectivePath]);

  // Fetch branches for root repo (for "Local branches" section at bottom)
  const rootRepoPath = repos[0]?.path;

  const fetchBranches = useCallback(async () => {
    if (!rootRepoPath) return;
    setIsLoadingBranches(true);
    try {
      const result = await window.electronAPI.getRepoBranches({ repoPath: rootRepoPath });
      if (result.success && result.data) setBranchData(result.data);
    } catch {
      // silent — branches section just won't show
    } finally {
      setIsLoadingBranches(false);
    }
  }, [rootRepoPath]);

  // For single-repo, fetch branch data on mount so the trigger shows the real current branch
  useEffect(() => {
    if (!isMultiRepo && rootRepoPath) {
      fetchBranches();
    }
  }, [isMultiRepo, rootRepoPath, fetchBranches]);

  useEffect(() => {
    if (popoverOpen) {
      fetchBranches();
    } else {
      setSearchQuery('');
      // Keep branchData for single-repo so the trigger shows the real current branch
      if (isMultiRepo) setBranchData(null);
    }
  }, [popoverOpen, fetchBranches, isMultiRepo]);

  // Filter local branches by search (excluding _reserve/*)
  const filteredLocalBranches = useMemo(() => {
    if (!branchData) return [];
    const q = searchQuery.toLowerCase();
    return branchData.local.filter(
      (b) => !isReserveBranch(b.name) && (!q || b.name.toLowerCase().includes(q))
    );
  }, [branchData, searchQuery]);

  // ── Actions (operate on ALL repos) ──

  const handleUpdateAll = useCallback(async () => {
    if (!projectId) return;
    setIsUpdating(true);
    try {
      const result = await window.electronAPI.updateProjectRepos({
        projectId,
        repoPaths: allRepoPaths,
        stashIfDirty: true,
      });
      if (result.success) {
        toast({ title: 'Update complete', description: `Updated ${repos.length} repo${repos.length !== 1 ? 's' : ''}` });
        onBranchChange?.();
      } else {
        const repoError = Array.isArray(result.data)
          ? result.data.find((r: { success: boolean; error?: string }) => !r.success)?.error
          : undefined;
        toast({ title: 'Update failed', description: result.error || repoError || 'Unknown error', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  }, [projectId, allRepoPaths, repos.length, onBranchChange]);

  const handlePushAll = useCallback(async () => {
    setIsPushing(true);
    try {
      const results = await Promise.allSettled(
        allRepoPaths.map((repoPath) => window.electronAPI.gitPush({ repoPath }))
      );
      const failures = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      );
      if (failures.length === 0) {
        toast({ title: 'Push complete', description: `Pushed ${repos.length} repo${repos.length !== 1 ? 's' : ''}` });
        onBranchChange?.();
      } else {
        const firstError =
          failures[0]?.status === 'fulfilled'
            ? (failures[0] as PromiseFulfilledResult<{ success: boolean; error?: string }>).value.error
            : (failures[0] as PromiseRejectedResult).reason?.message;
        toast({ title: 'Push failed', description: firstError || 'Some repos failed to push', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Push failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsPushing(false);
    }
  }, [allRepoPaths, repos.length, onBranchChange]);

  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(worktreePath);
      toast({ title: 'Copied to clipboard', description: 'Worktree path copied' });
    } catch {
      toast({ title: 'Failed to copy', description: 'Could not copy path to clipboard', variant: 'destructive' });
    }
  }, [worktreePath]);

  const shortWorktreeId = worktreeId.slice(0, 7);

  return (
    <TooltipProvider>
      <div className="bg-muted text-muted-foreground flex h-6 items-center border-t px-2 text-xs">
        {/* Agent Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onAgentClick}
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
                'hover:text-foreground focus-visible:ring-ring focus:outline-none focus-visible:ring-1'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', statusColors[agentStatus])} />
              <span className="max-w-[100px] truncate">{agentName}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>
              {agentName} - {statusLabels[agentStatus]}
            </p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1.5 h-3" />

        {/* Branch Info — Popover */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
                'hover:text-foreground focus-visible:ring-ring focus:outline-none focus-visible:ring-1'
              )}
            >
              <GitBranch className="h-3 w-3" />
              {isMultiRepo ? (
                <span>Branches</span>
              ) : (
                <>
                  <span className="max-w-[120px] truncate">
                    {branchData?.current || repos[0]?.branch || currentBranch}
                  </span>
                  {(() => {
                    const cur = branchData?.current || currentBranch;
                    const info = branchData?.local.find((b) => b.name === cur);
                    const ahead = info?.ahead || commitsAhead;
                    const behind = info?.behind || commitsBehind;
                    if (!ahead && !behind) return null;
                    return (
                      <span className="flex items-center gap-0.5 text-[10px]">
                        {ahead > 0 && (
                          <span className="text-blue-600 dark:text-blue-400">↑{ahead}</span>
                        )}
                        {behind > 0 && (
                          <span className="text-orange-600 dark:text-orange-400">↓{behind}</span>
                        )}
                      </span>
                    );
                  })()}
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 p-0">
            {/* Action buttons */}
            <div className="flex items-center gap-1 p-2">
              <button
                onClick={handleUpdateAll}
                disabled={isUpdating || !projectId}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-sm border px-2 py-1 text-xs',
                  'hover:bg-accent disabled:opacity-50'
                )}
              >
                <RefreshCw className={cn('h-3 w-3', isUpdating && 'animate-spin')} />
                Update
              </button>
              <button
                disabled
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-sm border px-2 py-1 text-xs',
                  'opacity-50 cursor-not-allowed'
                )}
              >
                <Check className="h-3 w-3" />
                Commit
              </button>
              <button
                onClick={handlePushAll}
                disabled={isPushing}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-sm border px-2 py-1 text-xs',
                  'hover:bg-accent disabled:opacity-50'
                )}
              >
                <ArrowUpFromLine className={cn('h-3 w-3', isPushing && 'animate-spin')} />
                Push
              </button>
            </div>

            <Separator />

            {/* Repos list */}
            <div className="p-1">
              <div className="text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                Repositories
              </div>
              {repos.map((repo) => (
                <RepoBranchPopover
                  key={repo.path}
                  repoPath={repo.path}
                  repoName={repo.name}
                  currentBranch={repoBranchOverrides[repo.path] || repo.branch}
                  onBranchSwitched={(newBranch) => {
                    setRepoBranchOverrides((prev) => ({ ...prev, [repo.path]: newBranch }));
                    onBranchChange?.();
                  }}
                />
              ))}
            </div>

            <Separator />

            {/* Search local branches */}
            <div className="p-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Filter branches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="placeholder:text-muted-foreground focus:ring-ring h-7 w-full rounded-sm border bg-transparent pr-2 pl-7 text-xs outline-none focus:ring-1"
                />
              </div>
            </div>

            <Separator />

            {/* Local branches */}
            {isLoadingBranches && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              </div>
            )}
            {!isLoadingBranches && (
              <ScrollArea className="max-h-[200px]">
                <div className="p-1">
                  <div className="text-muted-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                    Local Branches
                  </div>
                  {filteredLocalBranches.length > 0 ? (
                    filteredLocalBranches.map((branch) => {
                      const isCurrent = branch.name === (branchData?.current || currentBranch);
                      return (
                        <div
                          key={branch.name}
                          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-xs"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <GitBranch className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{branch.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {branch.ahead && branch.ahead > 0 && (
                              <span className="text-[10px] text-blue-600 dark:text-blue-400">
                                ↑{branch.ahead}
                              </span>
                            )}
                            {branch.behind && branch.behind > 0 && (
                              <span className="text-[10px] text-orange-600 dark:text-orange-400">
                                ↓{branch.behind}
                              </span>
                            )}
                            {isCurrent && (
                              <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-muted-foreground py-3 text-center text-xs">
                      {searchQuery.trim() ? 'No branches found' : 'No local branches'}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-1.5 h-3" />

        {/* Changes Count */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onChangesClick}
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
                'hover:text-foreground focus-visible:ring-ring focus:outline-none focus-visible:ring-1'
              )}
            >
              <FileCode className="h-3 w-3" />
              <span>
                {changesCount} {changesCount === 1 ? 'change' : 'changes'}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>
              {changesCount} file {changesCount === 1 ? 'change' : 'changes'}. Click to view.
            </p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1.5 h-3" />

        {/* Worktree ID */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopyWorktreePath}
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-0.5 font-mono transition-colors',
                'hover:text-foreground focus-visible:ring-ring focus:outline-none focus-visible:ring-1'
              )}
            >
              <span>{shortWorktreeId}</span>
              <Copy className="h-3 w-3 opacity-50" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-xs font-mono text-xs break-all">
              {worktreePath}
              <br />
              <span className="text-muted-foreground">Click to copy path</span>
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default StatusBar;
