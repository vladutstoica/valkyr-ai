import * as React from 'react';
import { Component, useMemo, type ReactNode, type ErrorInfo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Undo2,
  Check,
  AlertTriangle,
} from 'lucide-react';
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
  isLoadingDiff?: boolean;
  onToggleStaged: (path: string) => void;
  onToggleExpanded: (path: string) => void;
  onDiscard: (path: string) => void;
  isStaging?: boolean;
  isDiscarding?: boolean;
  theme?: 'light' | 'dark' | 'dark-black';
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

// Lazy load PatchDiff to prevent blocking the main bundle
const PatchDiff = React.lazy(() =>
  import('@pierre/diffs/react').then((mod) => ({ default: mod.PatchDiff }))
);

/**
 * Simple fallback diff view using plain text with syntax coloring.
 * Used when PatchDiff fails or while it's loading.
 * Collapses context lines to keep the view compact.
 */
function SimpleDiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  const renderedLines: React.ReactNode[] = [];
  let contextBuffer: string[] = [];
  const CONTEXT_PREVIEW = 2; // Show first/last N context lines

  const flushContext = (index: number) => {
    if (contextBuffer.length === 0) return;

    if (contextBuffer.length <= CONTEXT_PREVIEW * 2 + 1) {
      // Show all context if small enough
      contextBuffer.forEach((line, i) => {
        renderedLines.push(
          <div key={`ctx-${index}-${i}`} className="px-2 text-muted-foreground">
            {line || ' '}
          </div>
        );
      });
    } else {
      // Show first N, collapsed indicator, last N
      contextBuffer.slice(0, CONTEXT_PREVIEW).forEach((line, i) => {
        renderedLines.push(
          <div key={`ctx-start-${index}-${i}`} className="px-2 text-muted-foreground">
            {line || ' '}
          </div>
        );
      });
      renderedLines.push(
        <div key={`collapsed-${index}`} className="px-2 py-1 text-center text-xs text-muted-foreground/60 bg-muted/30">
          ··· {contextBuffer.length - CONTEXT_PREVIEW * 2} unchanged lines ···
        </div>
      );
      contextBuffer.slice(-CONTEXT_PREVIEW).forEach((line, i) => {
        renderedLines.push(
          <div key={`ctx-end-${index}-${i}`} className="px-2 text-muted-foreground">
            {line || ' '}
          </div>
        );
      });
    }
    contextBuffer = [];
  };

  lines.forEach((line, i) => {
    // Skip header lines
    if (line.startsWith('diff ') || line.startsWith('index ') ||
        line.startsWith('---') || line.startsWith('+++')) {
      return;
    }

    if (line.startsWith('@@')) {
      flushContext(i);
      renderedLines.push(
        <div key={i} className="px-2 py-0.5 text-blue-600 dark:text-blue-400 bg-blue-500/5 text-[10px]">
          {line}
        </div>
      );
    } else if (line.startsWith('+')) {
      flushContext(i);
      renderedLines.push(
        <div key={i} className="px-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
          {line || ' '}
        </div>
      );
    } else if (line.startsWith('-')) {
      flushContext(i);
      renderedLines.push(
        <div key={i} className="px-2 text-rose-600 dark:text-rose-400 bg-rose-500/10">
          {line || ' '}
        </div>
      );
    } else {
      // Context line - buffer it
      contextBuffer.push(line);
    }
  });

  // Flush remaining context
  flushContext(lines.length);

  return (
    <pre className="overflow-x-auto p-2 font-mono text-xs leading-relaxed">
      {renderedLines}
    </pre>
  );
}

/**
 * Lightweight error boundary for PatchDiff component.
 * Falls back to SimpleDiffView when PatchDiff fails.
 */
interface DiffErrorBoundaryProps {
  children: ReactNode;
  filePath: string;
  diff?: string;
}

interface DiffErrorBoundaryState {
  hasError: boolean;
}

class DiffErrorBoundary extends Component<DiffErrorBoundaryProps, DiffErrorBoundaryState> {
  constructor(props: DiffErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): DiffErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[DiffErrorBoundary] Failed to render diff for ${this.props.filePath}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fall back to simple diff view
      if (this.props.diff) {
        return <SimpleDiffView diff={this.props.diff} />;
      }
      return (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>Failed to render diff</span>
        </div>
      );
    }

    return this.props.children;
  }
}

export const FileChangeItem = React.memo(function FileChangeItem({
  path,
  status,
  additions,
  deletions,
  isStaged,
  isExpanded,
  diff,
  isLoadingDiff = false,
  onToggleStaged,
  onToggleExpanded,
  onDiscard,
  isStaging = false,
  isDiscarding = false,
  theme = 'dark',
}: FileChangeItemProps) {
  const fileName = path.split('/').pop() || path;
  const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  const patchDiffOptions = useMemo(() => {
    const isDarkTheme = theme === 'dark' || theme === 'dark-black';
    const baseOptions = {
      theme: (isDarkTheme ? 'pierre-dark' : 'pierre-light') as 'pierre-dark' | 'pierre-light',
      diffStyle: 'unified' as const,
      diffIndicators: 'bars' as const,
      disableFileHeader: true,
      overflow: 'wrap' as const,
      disableLineNumbers: false,
      lineDiffType: 'word' as const,
      // Collapse unchanged/context lines by default - click to expand
      expandUnchanged: false,
      // Show 3 lines of context around changes
      expansionLineCount: 3,
    };

    if (theme === 'dark-black') {
      return {
        ...baseOptions,
        unsafeCSS: `
          .diff-view { background-color: #000000 !important; }
          .diff-line { background-color: #000000 !important; }
          .diff-line-content { background-color: #000000 !important; }
        `,
      };
    }

    return baseOptions;
  }, [theme]);

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
      {isExpanded && (
        <div className="border-t border-border/30 bg-muted/20">
          <div className="max-h-80 overflow-auto">
            {isLoadingDiff ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
                <Spinner size="sm" />
                <span>Loading diff...</span>
              </div>
            ) : diff ? (
              // Use simple view for large diffs (>50KB) to prevent performance issues
              diff.length > 50000 ? (
                <SimpleDiffView diff={diff} />
              ) : (
                <DiffErrorBoundary filePath={path} diff={diff}>
                  <React.Suspense fallback={<SimpleDiffView diff={diff} />}>
                    <PatchDiff
                      patch={diff}
                      options={patchDiffOptions}
                      className="text-xs"
                    />
                  </React.Suspense>
                </DiffErrorBoundary>
              )
            ) : (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                No diff available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default FileChangeItem;
