import React, { useCallback } from 'react';
import { GitBranch, ArrowDown, ArrowUp, FileCode, Copy } from 'lucide-react';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { toast } from '../../hooks/use-toast';

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
  onAgentClick?: () => void;
  onBranchClick?: () => void;
  onChangesClick?: () => void;
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
  onAgentClick,
  onBranchClick,
  onChangesClick,
}) => {
  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(worktreePath);
      toast({
        title: 'Copied to clipboard',
        description: 'Worktree path copied',
      });
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy path to clipboard',
        variant: 'destructive',
      });
    }
  }, [worktreePath]);

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

      {/* Branch Info */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onBranchClick}
            className={cn(
              'flex items-center gap-1.5 px-1.5 py-0.5 transition-colors',
              'hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            )}
          >
            <GitBranch className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{baseBranch}</span>
            <span className="text-muted-foreground/60">→</span>
            <span className="max-w-[80px] truncate">{currentBranch}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>
            Base: {baseBranch} → Current: {currentBranch}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* Sync Status - only show if there are commits behind or ahead */}
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
                {commitsBehind > 0 && `${commitsBehind} commit${commitsBehind !== 1 ? 's' : ''} behind`}
                {commitsBehind > 0 && commitsAhead > 0 && ', '}
                {commitsAhead > 0 && `${commitsAhead} commit${commitsAhead !== 1 ? 's' : ''} ahead`}
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
