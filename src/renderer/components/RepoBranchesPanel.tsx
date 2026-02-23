import React from 'react';
import { GitBranch, ArrowDownLeft, GitCommit, ArrowUpRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import type { SubRepo } from '../types/app';

interface RepoBranchInfo {
  name: string;
  branch: string;
  relativePath?: string;
}

interface RepoBranchesPanelProps {
  /** Main repository info (for single-repo projects) */
  mainRepo?: {
    name: string;
    branch?: string;
  };
  /** Sub-repositories (for multi-repo projects) */
  subRepos?: SubRepo[] | null;
  /** Session/task worktree branch (overrides repo branches when in worktree session) */
  sessionBranch?: string;
  /** Whether the current session uses a worktree */
  useWorktree?: boolean;
  /** Callback when Update Project is clicked */
  onUpdateProject?: () => void;
  /** Callback when Commit is clicked */
  onCommit?: () => void;
  /** Callback when Push is clicked */
  onPush?: () => void;
  className?: string;
}

/**
 * RepoBranchesPanel - Shows repository branches in the right sidebar
 * For single repos: shows one row with repo name and branch
 * For multi-repos: shows each sub-repo with its branch
 * Click opens a dropdown menu with git actions
 */
export const RepoBranchesPanel: React.FC<RepoBranchesPanelProps> = ({
  mainRepo,
  subRepos,
  sessionBranch,
  useWorktree = true,
  onUpdateProject,
  onCommit,
  onPush,
  className,
}) => {
  // Build the list of repos to display
  const repos: RepoBranchInfo[] = React.useMemo(() => {
    if (subRepos && subRepos.length > 0) {
      return subRepos.map((repo) => ({
        name: repo.name,
        branch: useWorktree && sessionBranch ? sessionBranch : repo.gitInfo?.branch || 'unknown',
        relativePath: repo.relativePath,
      }));
    }
    if (mainRepo) {
      return [
        {
          name: mainRepo.name,
          branch: useWorktree && sessionBranch ? sessionBranch : mainRepo.branch || 'unknown',
        },
      ];
    }
    return [];
  }, [mainRepo, subRepos, sessionBranch, useWorktree]);

  if (repos.length === 0) {
    return null;
  }

  const hasActions = onUpdateProject || onCommit || onPush;

  return (
    <div className={cn('border-b p-2', className)}>
      {repos.map((repo) => (
        <div key={repo.relativePath || repo.name}>
          {hasActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start" size="sm">
                  <GitBranch className="text-muted-foreground mr-2 h-4 w-4" />
                  <span className="flex-1 truncate text-left">{repo.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{repo.branch}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {onUpdateProject && (
                  <DropdownMenuItem onClick={onUpdateProject}>
                    <ArrowDownLeft className="mr-2 h-4 w-4" />
                    Update Project
                  </DropdownMenuItem>
                )}
                {onCommit && (
                  <DropdownMenuItem onClick={onCommit}>
                    <GitCommit className="mr-2 h-4 w-4" />
                    Commit
                  </DropdownMenuItem>
                )}
                {onPush && (
                  <DropdownMenuItem onClick={onPush}>
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Push
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center px-3 py-2 text-sm">
              <GitBranch className="text-muted-foreground mr-2 h-4 w-4" />
              <span className="flex-1 truncate">{repo.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">{repo.branch}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default RepoBranchesPanel;
