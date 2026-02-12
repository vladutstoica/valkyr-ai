import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GitBranch, Search, Plus, Check, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { BranchInfo, RepoBranchesResult } from '@/types/electron-api';

export interface BranchSwitcherProps {
  projectId: string;
  projectPath: string;
  currentBranch: string;
  onBranchChange?: (branch: string) => void;
  className?: string;
}

type BranchGroup = {
  prefix: string;
  branches: BranchInfo[];
  expanded: boolean;
};

export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({
  projectId,
  projectPath,
  currentBranch,
  onBranchChange,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [branchData, setBranchData] = useState<RepoBranchesResult | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch branches when popover opens
  const fetchBranches = useCallback(async () => {
    if (!projectPath) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.getRepoBranches({ repoPath: projectPath });
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
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (open) {
      fetchBranches();
      // Focus search input when popover opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    } else {
      // Reset state when closing
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [open, fetchBranches]);

  // Group local branches by prefix (e.g., feature/, fix/, bugfix/)
  const groupedLocalBranches = useMemo(() => {
    if (!branchData?.local) return [];

    const groups: Map<string, BranchInfo[]> = new Map();
    const ungrouped: BranchInfo[] = [];

    branchData.local.forEach((branch) => {
      const parts = branch.name.split('/');
      if (parts.length > 1) {
        const prefix = parts[0];
        if (!groups.has(prefix)) {
          groups.set(prefix, []);
        }
        groups.get(prefix)!.push(branch);
      } else {
        ungrouped.push(branch);
      }
    });

    // Convert to array and sort
    const result: BranchGroup[] = [];

    // Add ungrouped branches first
    if (ungrouped.length > 0) {
      result.push({ prefix: '', branches: ungrouped, expanded: true });
    }

    // Add grouped branches
    groups.forEach((branches, prefix) => {
      if (branches.length >= 2) {
        // Only group if 2+ branches
        result.push({
          prefix,
          branches,
          expanded: expandedGroups.has(prefix),
        });
      } else {
        // Add single branches to ungrouped
        if (result.length === 0 || result[0].prefix !== '') {
          result.unshift({ prefix: '', branches: [], expanded: true });
        }
        result[0].branches.push(...branches);
      }
    });

    return result;
  }, [branchData?.local, expandedGroups]);

  // Filter branches based on search query
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

  // Build flat list of selectable items for keyboard navigation
  const selectableItems = useMemo(() => {
    if (!filteredData) return [];

    const items: Array<{ type: 'branch' | 'new'; name: string; isRemote?: boolean }> = [];

    // New branch option
    items.push({ type: 'new', name: 'New Branch...' });

    // Recent branches
    filteredData.recent.forEach((name) => {
      if (!items.some((i) => i.name === name)) {
        items.push({ type: 'branch', name });
      }
    });

    // Local branches (flattened from groups)
    filteredData.local.forEach((b) => {
      if (!items.some((i) => i.name === b.name)) {
        items.push({ type: 'branch', name: b.name });
      }
    });

    // Remote branches
    filteredData.remote.forEach((b) => {
      if (!items.some((i) => i.name === b.name)) {
        items.push({ type: 'branch', name: b.name, isRemote: true });
      }
    });

    return items;
  }, [filteredData]);

  // Handle branch switch
  const handleSwitchBranch = useCallback(
    async (branchName: string, isRemote: boolean = false) => {
      if (branchName === currentBranch) {
        setOpen(false);
        return;
      }

      setIsSwitching(true);
      try {
        // For remote branches, extract the branch name (remove origin/ prefix)
        const targetBranch = isRemote ? branchName.replace(/^origin\//, '') : branchName;

        const result = await window.electronAPI.switchRepoBranch({
          repoPath: projectPath,
          branch: targetBranch,
          stashIfDirty: true,
        });

        if (result.success) {
          toast({
            title: 'Branch switched',
            description: `Switched to ${targetBranch}${result.stashed ? ' (changes stashed)' : ''}`,
          });
          onBranchChange?.(targetBranch);
          setOpen(false);
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
        setIsSwitching(false);
      }
    },
    [projectPath, currentBranch, onBranchChange]
  );

  // Handle new branch creation
  const handleNewBranch = useCallback(() => {
    // For now, just close the popover - this would typically open a dialog
    setOpen(false);
    toast({
      title: 'Create new branch',
      description: 'New branch creation dialog would open here',
    });
  }, []);

  // Toggle group expansion
  const toggleGroup = useCallback((prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, selectableItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          const selectedItem = selectableItems[selectedIndex];
          if (selectedItem) {
            if (selectedItem.type === 'new') {
              handleNewBranch();
            } else {
              handleSwitchBranch(selectedItem.name, selectedItem.isRemote);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [selectableItems, selectedIndex, handleNewBranch, handleSwitchBranch]
  );

  // Render status indicator for a branch
  const renderBranchStatus = (branch: BranchInfo, isCurrent: boolean) => {
    if (isCurrent) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <Check className="h-3 w-3" />
          current
        </span>
      );
    }

    if (branch.ahead && branch.ahead > 0 && branch.behind && branch.behind > 0) {
      return (
        <span
          className="text-xs text-amber-600 dark:text-amber-400"
          title={`${branch.ahead} commits ahead, ${branch.behind} commits behind`}
        >
          {branch.ahead}↑ {branch.behind}↓
        </span>
      );
    }

    if (branch.ahead && branch.ahead > 0) {
      return (
        <span className="text-xs text-blue-600 dark:text-blue-400" title={`${branch.ahead} commits ahead`}>
          ↑{branch.ahead} ahead
        </span>
      );
    }

    if (branch.behind && branch.behind > 0) {
      return (
        <span className="text-xs text-orange-600 dark:text-orange-400" title={`${branch.behind} commits behind`}>
          ↓{branch.behind} behind
        </span>
      );
    }

    return null;
  };

  // Render a branch item
  const renderBranchItem = (
    branch: BranchInfo | { name: string },
    isRemote: boolean = false,
    itemIndex: number
  ) => {
    const isCurrent = branch.name === currentBranch || branch.name === `origin/${currentBranch}`;
    const isSelected = selectedIndex === itemIndex;
    const fullBranch = 'tracking' in branch ? (branch as BranchInfo) : { name: branch.name };

    return (
      <button
        key={branch.name}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
          'hover:bg-accent focus:bg-accent focus:outline-none',
          isSelected && 'bg-accent',
          isSwitching && 'pointer-events-none opacity-50'
        )}
        onClick={() => handleSwitchBranch(branch.name, isRemote)}
        disabled={isSwitching}
        role="option"
        aria-selected={isSelected}
        aria-current={isCurrent ? 'true' : undefined}
      >
        <div className="flex items-center gap-2 truncate">
          <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{branch.name}</span>
        </div>
        {'tracking' in branch && renderBranchStatus(fullBranch, isCurrent)}
        {isCurrent && !('tracking' in branch) && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Check className="h-3 w-3" />
            current
          </span>
        )}
      </button>
    );
  };

  // Render a branch group (collapsible folder)
  const renderBranchGroup = (group: BranchGroup, startIndex: number) => {
    if (group.prefix === '') {
      // Ungrouped branches
      return group.branches.map((branch, idx) =>
        renderBranchItem(branch, false, startIndex + idx)
      );
    }

    const isExpanded = expandedGroups.has(group.prefix);

    return (
      <div key={group.prefix} className="space-y-0.5">
        <button
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
            'hover:bg-accent focus:bg-accent focus:outline-none'
          )}
          onClick={() => toggleGroup(group.prefix)}
        >
          <div className="flex items-center gap-2">
            <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span>{group.prefix}</span>
            <span className="text-xs text-muted-foreground">({group.branches.length})</span>
          </div>
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        </button>
        {isExpanded && (
          <div className="ml-4 space-y-0.5">
            {group.branches.map((branch, idx) =>
              renderBranchItem(branch, false, startIndex + idx)
            )}
          </div>
        )}
      </div>
    );
  };

  // Calculate item indices for keyboard navigation
  let itemIndex = 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 gap-1.5 px-2 text-xs font-normal',
            className
          )}
          aria-label={`Current branch: ${currentBranch}. Click to switch branches`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span className="max-w-[120px] truncate">{currentBranch}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onKeyDown={handleKeyDown}
        role="listbox"
        aria-label="Branch list"
      >
        {/* Search input */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              className="h-8 pl-8 text-sm"
              aria-label="Search branches"
            />
          </div>
        </div>

        <Separator />

        {/* New branch option */}
        <div className="p-1">
          <button
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
              'hover:bg-accent focus:bg-accent focus:outline-none',
              selectedIndex === 0 && 'bg-accent'
            )}
            onClick={handleNewBranch}
            role="option"
            aria-selected={selectedIndex === 0}
          >
            <div className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              <span>New Branch...</span>
            </div>
            <kbd className="pointer-events-none hidden select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              {navigator.platform.includes('Mac') ? '⌥⌘' : 'Alt+Ctrl+'}N
            </kbd>
          </button>
        </div>

        <Separator />

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Branch list */}
        {!isLoading && filteredData && (
          <ScrollArea className="max-h-[300px]" ref={listRef}>
            <div className="p-1">
              {/* Recent branches */}
              {filteredData.recent.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent
                  </div>
                  {filteredData.recent.map((name) => {
                    const branch = filteredData.local.find((b) => b.name === name) || { name };
                    itemIndex++;
                    return renderBranchItem(branch, false, itemIndex);
                  })}
                </div>
              )}

              {/* Local branches */}
              {filteredData.local.length > 0 && (
                <>
                  {filteredData.recent.length > 0 && <Separator className="my-1" />}
                  <div className="space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Local
                    </div>
                    {/* If searching, show flat list; otherwise show groups */}
                    {searchQuery.trim() ? (
                      filteredData.local.map((branch) => {
                        itemIndex++;
                        return renderBranchItem(branch, false, itemIndex);
                      })
                    ) : (
                      groupedLocalBranches.map((group) => {
                        const startIdx = itemIndex + 1;
                        itemIndex += group.branches.length;
                        return renderBranchGroup(group, startIdx);
                      })
                    )}
                  </div>
                </>
              )}

              {/* Remote branches */}
              {filteredData.remote.length > 0 && (
                <>
                  {(filteredData.recent.length > 0 || filteredData.local.length > 0) && (
                    <Separator className="my-1" />
                  )}
                  <div className="space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Remote
                    </div>
                    {filteredData.remote.map((branch) => {
                      itemIndex++;
                      return renderBranchItem(branch, true, itemIndex);
                    })}
                  </div>
                </>
              )}

              {/* Empty state */}
              {filteredData.recent.length === 0 &&
                filteredData.local.length === 0 &&
                filteredData.remote.length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {searchQuery.trim() ? 'No branches found' : 'No branches available'}
                  </div>
                )}
            </div>
          </ScrollArea>
        )}

        {/* Switching overlay */}
        {isSwitching && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Switching branch...</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default BranchSwitcher;
