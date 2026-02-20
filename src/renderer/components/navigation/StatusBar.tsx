import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import {
  GitBranch,
  ArrowDown,
  ArrowUp,
  FileCode,
  Copy,
  Search,
  Check,
  Loader2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { toast } from '../../hooks/use-toast';
import type { BranchInfo, RepoBranchesResult } from '@/types/electron-api';
import type { SubRepo } from '@/types/app';

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
  const [branchData, setBranchData] = useState<RepoBranchesResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState<string | null>(null);
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [repoSelectorOpen, setRepoSelectorOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The effective path: taskPath (worktree) or worktreePath (falls back to project path)
  const effectivePath = taskPath || worktreePath || undefined;

  // Determine available repos: use subRepos if multi-repo, otherwise just effectivePath
  const repos = useMemo(() => {
    if (subRepos && subRepos.length > 0) {
      return subRepos.map((r) => ({ name: r.name, path: r.path }));
    }
    if (effectivePath) {
      return [{ name: 'repo', path: effectivePath }];
    }
    return [];
  }, [subRepos, effectivePath]);

  const isMultiRepo = repos.length > 1;

  // The active repo path for IPC calls
  const activeRepoPath = selectedRepoPath || repos[0]?.path || effectivePath;
  const activeRepoName = repos.find((r) => r.path === activeRepoPath)?.name || 'repo';

  // Fetch branches when popover opens or repo changes
  const fetchBranches = useCallback(async () => {
    if (!activeRepoPath) return;

    setIsLoadingBranches(true);
    try {
      const result = await window.electronAPI.getRepoBranches({ repoPath: activeRepoPath });
      if (result.success && result.data) {
        setBranchData(result.data);
      } else {
        toast({
          title: 'Failed to load branches',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to load branches',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingBranches(false);
    }
  }, [activeRepoPath]);

  useEffect(() => {
    if (popoverOpen) {
      fetchBranches();
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearchQuery('');
      setBranchData(null);
    }
  }, [popoverOpen, fetchBranches]);

  useEffect(() => {
    if (!popoverOpen) {
      setRepoSelectorOpen(false);
    }
  }, [popoverOpen]);

  // Filter branches by search
  const filteredData = useMemo(() => {
    if (!branchData) return null;
    if (!searchQuery.trim()) return branchData;

    const query = searchQuery.toLowerCase();
    return {
      ...branchData,
      recent: branchData.recent.filter((name) => name.toLowerCase().includes(query)),
      local: branchData.local.filter((b) => b.name.toLowerCase().includes(query)),
      remote: branchData.remote.filter((b) => b.name.toLowerCase().includes(query)),
    };
  }, [branchData, searchQuery]);

  // Pull (fetch+pull)
  const handlePull = useCallback(async () => {
    if (!projectId || !activeRepoPath) return;

    setIsPulling(true);
    try {
      const result = await window.electronAPI.updateProjectRepos({
        projectId,
        repoPaths: [activeRepoPath],
        stashIfDirty: true,
      });
      if (result.success) {
        toast({ title: 'Pull complete', description: `Updated ${activeRepoName}` });
        fetchBranches(); // refresh branch list
        onBranchChange?.();
      } else {
        // Error may be at top level or inside data array entries
        const repoError = Array.isArray(result.data)
          ? result.data.find((r: { success: boolean; error?: string }) => !r.success)?.error
          : undefined;
        toast({
          title: 'Pull failed',
          description: result.error || repoError || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Pull failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsPulling(false);
    }
  }, [projectId, activeRepoPath, activeRepoName, fetchBranches, onBranchChange]);

  // Switch branch
  const handleSwitchBranch = useCallback(
    async (branchName: string, isRemote: boolean = false) => {
      const effectiveCurrent = branchData?.current || currentBranch;
      if (branchName === effectiveCurrent) {
        setPopoverOpen(false);
        return;
      }
      if (!activeRepoPath) return;

      const targetBranch = isRemote ? branchName.replace(/^origin\//, '') : branchName;
      setSwitchingBranch(targetBranch);
      try {
        const result = await window.electronAPI.switchRepoBranch({
          repoPath: activeRepoPath,
          branch: targetBranch,
          stashIfDirty: true,
        });
        if (result.success) {
          toast({
            title: 'Branch switched',
            description: `Switched to ${targetBranch}${result.stashed ? ' (changes stashed)' : ''}`,
          });
          onBranchChange?.();
          setPopoverOpen(false);
        } else {
          toast({
            title: 'Failed to switch branch',
            description: result.error || 'Unknown error',
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Failed to switch branch',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setSwitchingBranch(null);
      }
    },
    [activeRepoPath, branchData, currentBranch, onBranchChange]
  );

  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(worktreePath);
      toast({ title: 'Copied to clipboard', description: 'Worktree path copied' });
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy path to clipboard',
        variant: 'destructive',
      });
    }
  }, [worktreePath]);

  // Render branch status badges
  const renderBranchStatus = (branch: BranchInfo, isCurrent: boolean) => {
    if (isCurrent) {
      return (
        <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
        </span>
      );
    }
    if (branch.ahead && branch.ahead > 0 && branch.behind && branch.behind > 0) {
      return (
        <span className="text-[10px] text-amber-600 dark:text-amber-400">
          {branch.ahead}↑ {branch.behind}↓
        </span>
      );
    }
    if (branch.ahead && branch.ahead > 0) {
      return <span className="text-[10px] text-blue-600 dark:text-blue-400">↑{branch.ahead}</span>;
    }
    if (branch.behind && branch.behind > 0) {
      return (
        <span className="text-[10px] text-orange-600 dark:text-orange-400">↓{branch.behind}</span>
      );
    }
    return null;
  };

  // Render a single branch item
  const renderBranchItem = (branch: BranchInfo | { name: string }, isRemote: boolean = false) => {
    const effectiveCurrent = branchData?.current || currentBranch;
    const isCurrent =
      branch.name === effectiveCurrent || branch.name === `origin/${effectiveCurrent}`;
    const fullBranch = 'tracking' in branch ? (branch as BranchInfo) : { name: branch.name };
    const isBeingSwitched =
      switchingBranch === branch.name ||
      switchingBranch === branch.name.replace(/^origin\//, '');

    return (
      <button
        key={branch.name}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-xs',
          'hover:bg-accent focus:bg-accent focus:outline-hidden',
          switchingBranch && !isBeingSwitched && 'pointer-events-none opacity-50'
        )}
        onClick={() => handleSwitchBranch(branch.name, isRemote)}
        disabled={!!switchingBranch}
      >
        <div className="flex items-center gap-1.5 truncate">
          {isBeingSwitched ? (
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <GitBranch className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{branch.name}</span>
        </div>
        {'tracking' in branch && renderBranchStatus(fullBranch, isCurrent)}
        {isCurrent && !('tracking' in branch) && (
          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
        )}
      </button>
    );
  };

  const shortWorktreeId = worktreeId.slice(0, 7);

  return (
    <TooltipProvider>
      <div className="flex h-6 items-center border-t bg-muted px-2 text-xs text-muted-foreground">
        {/* Agent Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onAgentClick}
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
                'hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
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
                'hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            >
              <GitBranch className="h-3 w-3" />
              <span className="max-w-[80px] truncate">{baseBranch}</span>
              <span className="text-muted-foreground/60">&rarr;</span>
              <span className="max-w-[80px] truncate">{currentBranch}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-72 p-0">
            {/* Header: current branch + pull */}
            <div className="space-y-1.5 p-2">
              {/* Multi-repo selector */}
              {isMultiRepo && (
                <Popover open={repoSelectorOpen} onOpenChange={setRepoSelectorOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'flex w-full items-center justify-between rounded-sm border px-2 py-1 text-xs',
                        'hover:bg-accent'
                      )}
                    >
                      <span className="truncate font-medium">{activeRepoName}</span>
                      <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-56 p-1">
                    {repos.map((repo) => (
                      <button
                        key={repo.path}
                        className={cn(
                          'flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-xs',
                          'hover:bg-accent',
                          repo.path === activeRepoPath && 'bg-accent'
                        )}
                        onClick={() => {
                          setSelectedRepoPath(repo.path);
                          setRepoSelectorOpen(false);
                        }}
                      >
                        <span className="truncate">{repo.name}</span>
                        {repo.path === activeRepoPath && (
                          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}

              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">
                    {branchData?.current || currentBranch}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Base: {baseBranch}
                    {(commitsBehind > 0 || commitsAhead > 0) && (
                      <span className="ml-1.5">
                        {commitsAhead > 0 && <span>↑{commitsAhead}</span>}
                        {commitsAhead > 0 && commitsBehind > 0 && ' '}
                        {commitsBehind > 0 && <span>↓{commitsBehind}</span>}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handlePull}
                  disabled={isPulling || !projectId}
                  className={cn(
                    'flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px]',
                    'hover:bg-accent disabled:opacity-50'
                  )}
                >
                  <RefreshCw className={cn('h-3 w-3', isPulling && 'animate-spin')} />
                  Pull
                </button>
              </div>
            </div>

            <Separator />

            {/* Search */}
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search branches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 w-full rounded-sm border bg-transparent pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <Separator />

            {/* Loading state */}
            {isLoadingBranches && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Branch list */}
            {!isLoadingBranches && filteredData && (
              <ScrollArea className="max-h-[250px]">
                <div className="p-1">
                  {/* Recent */}
                  {filteredData.recent.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Recent
                      </div>
                      {filteredData.recent.map((name) => {
                        const branch = filteredData.local.find((b) => b.name === name) || {
                          name,
                        };
                        return renderBranchItem(branch, false);
                      })}
                    </div>
                  )}

                  {/* Local */}
                  {filteredData.local.length > 0 && (
                    <>
                      {filteredData.recent.length > 0 && <Separator className="my-1" />}
                      <div className="space-y-0.5">
                        <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Local
                        </div>
                        {filteredData.local.map((branch) => renderBranchItem(branch, false))}
                      </div>
                    </>
                  )}

                  {/* Remote */}
                  {filteredData.remote.length > 0 && (
                    <>
                      {(filteredData.recent.length > 0 || filteredData.local.length > 0) && (
                        <Separator className="my-1" />
                      )}
                      <div className="space-y-0.5">
                        <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Remote
                        </div>
                        {filteredData.remote.map((branch) => renderBranchItem(branch, true))}
                      </div>
                    </>
                  )}

                  {/* Empty state */}
                  {filteredData.recent.length === 0 &&
                    filteredData.local.length === 0 &&
                    filteredData.remote.length === 0 && (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        {searchQuery.trim() ? 'No branches found' : 'No branches available'}
                      </div>
                    )}
                </div>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>

        {/* Sync Status */}
        {(commitsBehind > 0 || commitsAhead > 0) && (
          <>
            <Separator orientation="vertical" className="mx-1.5 h-3" />
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                  {commitsBehind > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ArrowDown className="h-3 w-3" />
                      <span>{commitsBehind}</span>
                    </span>
                  )}
                  {commitsAhead > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ArrowUp className="h-3 w-3" />
                      <span>{commitsAhead}</span>
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>
                  {commitsBehind > 0 &&
                    `${commitsBehind} commit${commitsBehind !== 1 ? 's' : ''} behind`}
                  {commitsBehind > 0 && commitsAhead > 0 && ', '}
                  {commitsAhead > 0 &&
                    `${commitsAhead} commit${commitsAhead !== 1 ? 's' : ''} ahead`}
                </p>
              </TooltipContent>
            </Tooltip>
          </>
        )}

        <Separator orientation="vertical" className="mx-1.5 h-3" />

        {/* Changes Count */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onChangesClick}
              className={cn(
                'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
                'hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
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
                'hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            >
              <span>{shortWorktreeId}</span>
              <Copy className="h-3 w-3 opacity-50" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-xs break-all font-mono text-xs">
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
