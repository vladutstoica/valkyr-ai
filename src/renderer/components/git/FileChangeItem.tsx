import * as React from 'react';
import { Undo2 } from 'lucide-react';
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
  isSelected: boolean;
  onToggleStaged: (path: string) => void;
  onSelect: (path: string) => void;
  onDiscard: (path: string) => void;
  isStaging?: boolean;
  isDiscarding?: boolean;
  /** When true, show only filename (used inside directory tree view) */
  filenameOnly?: boolean;
  /** Nesting depth for indentation inside directory tree view */
  depth?: number;
}

const STATUS_LABELS: Record<FileStatus, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
};

const STATUS_FILENAME_COLORS: Record<FileStatus, string> = {
  M: 'text-amber-600 dark:text-amber-400',
  A: 'text-emerald-600 dark:text-emerald-400',
  D: 'text-rose-600 dark:text-rose-400',
  R: 'text-purple-600 dark:text-purple-400',
};

export const FileChangeItem = React.memo(function FileChangeItem({
  path,
  status,
  additions,
  deletions,
  isStaged,
  isSelected,
  onToggleStaged,
  onSelect,
  onDiscard,
  isStaging = false,
  isDiscarding = false,
  filenameOnly = false,
  depth = 0,
}: FileChangeItemProps) {
  const fileName = path.split('/').pop() || path;
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  const handleClick = () => {
    onSelect(path);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDiscard(path);
  };

  return (
    <div
      className={cn(
        'group flex h-7 cursor-pointer items-center gap-1.5 px-2 py-1 transition-colors hover:bg-muted/50',
        isStaged && 'bg-muted/30',
        isSelected && 'border-l-2 border-l-primary bg-muted/60'
      )}
      style={filenameOnly && depth > 0 ? { paddingLeft: `${8 + depth * 16}px` } : undefined}
      onClick={handleClick}
      title={path}
    >
      {/* Staging Checkbox */}
      <div onClick={handleCheckboxClick} className="flex-shrink-0">
        <Checkbox
          checked={isStaged}
          onCheckedChange={() => onToggleStaged(path)}
          disabled={isStaging}
          className="h-3.5 w-3.5 border-muted-foreground/50 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
        />
      </div>

      {/* File Icon */}
      <span className="flex-shrink-0 text-muted-foreground">
        <FileIcon filename={path} isDirectory={false} size={14} />
      </span>

      {/* File Path — colored by status */}
      <div className="min-w-0 flex-1 truncate text-xs" title={STATUS_LABELS[status]}>
        {!filenameOnly && directory && (
          <span className="text-muted-foreground">{directory}</span>
        )}
        <span className={STATUS_FILENAME_COLORS[status]}>{fileName}</span>
      </div>

      {/* Change Stats (hover-only) */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {additions > 0 && (
          <span className="text-[10px] font-medium text-emerald-500">
            +{additions}
          </span>
        )}
        {deletions > 0 && (
          <span className="text-[10px] font-medium text-rose-500">
            -{deletions}
          </span>
        )}
      </div>

      {/* Discard Button (hover-only) */}
      <div className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleDiscard}
                disabled={isDiscarding}
              >
                {isDiscarding ? <Spinner size="sm" /> : <Undo2 className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs font-medium">Discard changes</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
});

export default FileChangeItem;
