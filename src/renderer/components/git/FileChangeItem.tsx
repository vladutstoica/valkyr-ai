import * as React from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, Undo2, Check } from 'lucide-react';
import { PatchDiff } from '@pierre/diffs/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import { FileIcon } from '@/components/FileExplorer/FileIcons';
import type { FileStatus } from '@/hooks/useGitState';

export interface FileChangeItemProps {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  isStaged: boolean;
  isExpanded: boolean;
  diff?: string;
  onToggleStaged: (path: string) => void;
  onToggleExpanded: (path: string) => void;
  onDiscard: (path: string) => void;
  isStaging?: boolean;
  isDiscarding?: boolean;
  theme?: 'light' | 'dark';
}

const STATUS_LABELS: Record<FileStatus, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
};

const STATUS_COLORS: Record<FileStatus, string> = {
  M: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  A: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  D: 'bg-rose-500/20 text-rose-600 dark:text-rose-400',
  R: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
};

export function FileChangeItem({
  path,
  status,
  additions,
  deletions,
  isStaged,
  isExpanded,
  diff,
  onToggleStaged,
  onToggleExpanded,
  onDiscard,
  isStaging = false,
  isDiscarding = false,
  theme = 'dark',
}: FileChangeItemProps) {
  const fileName = path.split('/').pop() || path;
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  const handleToggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpanded(path);
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDiscard(path);
  };

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* File Header */}
      <div
        className={cn(
          'flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50',
          isStaged && 'bg-muted/30'
        )}
        onClick={handleToggleExpanded}
      >
        {/* Expand/Collapse Icon */}
        <button
          type="button"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleToggleExpanded}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Staging Checkbox */}
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isStaged}
            onCheckedChange={() => onToggleStaged(path)}
            disabled={isStaging}
            className="h-4 w-4"
          />
        </div>

        {/* Status Badge */}
        <span
          className={cn(
            'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold',
            STATUS_COLORS[status]
          )}
          title={STATUS_LABELS[status]}
        >
          {status}
        </span>

        {/* File Icon */}
        <span className="flex-shrink-0 text-muted-foreground">
          <FileIcon filename={path} isDirectory={false} size={16} />
        </span>

        {/* File Path */}
        <div className="min-w-0 flex-1 truncate">
          {directory && (
            <span className="text-muted-foreground">{directory}</span>
          )}
          <span className="font-medium text-foreground">{fileName}</span>
        </div>

        {/* Change Stats */}
        <div className="flex items-center gap-1.5">
          {additions > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Plus className="h-3 w-3" />
              {additions}
            </span>
          )}
          {deletions > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <Minus className="h-3 w-3" />
              {deletions}
            </span>
          )}
        </div>

        {/* Stage Status Indicator */}
        {isStaged ? (
          <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            Staged
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Not staged</span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={handleDiscard}
                  disabled={isDiscarding}
                >
                  {isDiscarding ? (
                    <Spinner size="sm" />
                  ) : (
                    <Undo2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="font-medium">Discard changes</p>
                <p className="text-xs text-muted-foreground">
                  Restore file to last committed version
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Diff View */}
      {isExpanded && diff && (
        <div className="border-t border-border/30 bg-muted/20">
          <div className="max-h-80 overflow-auto">
            <PatchDiff
              patch={diff}
              options={{
                theme: theme === 'dark' ? 'pierre-dark' : 'pierre-light',
                diffStyle: 'unified',
                diffIndicators: 'bars',
                disableFileHeader: true,
                overflow: 'scroll',
                disableLineNumbers: false,
                lineDiffType: 'word',
              }}
              className="text-xs"
            />
          </div>
        </div>
      )}

      {/* Collapsed Click Hint */}
      {!isExpanded && !diff && (
        <div
          className="cursor-pointer border-t border-border/30 bg-muted/10 px-3 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted/20"
          onClick={handleToggleExpanded}
        >
          Click to expand diff
        </div>
      )}
    </div>
  );
}

export default FileChangeItem;
