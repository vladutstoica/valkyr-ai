import * as React from 'react';
import { GitCommit, Send, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';

export interface CommitPanelProps {
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  onCommit: () => void;
  onCommitAndPush: () => void;
  isCommitting: boolean;
  hasStagedChanges: boolean;
  prUrl?: string;
  className?: string;
}

export function CommitPanel({
  commitMessage,
  onCommitMessageChange,
  onCommit,
  onCommitAndPush,
  isCommitting,
  hasStagedChanges,
  prUrl,
  className,
}: CommitPanelProps) {
  const canCommit = hasStagedChanges && commitMessage.trim().length > 0;

  return (
    <div className={cn('border-t border-border bg-muted/30 p-3', className)}>
      {/* PR Link */}
      {prUrl && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => window.electronAPI?.openExternal?.(prUrl)}
            className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View PR
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Commit Message */}
      <Textarea
        placeholder="Commit message..."
        value={commitMessage}
        onChange={(e) => onCommitMessageChange(e.target.value)}
        className="mb-2 min-h-[60px] resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit) {
            e.preventDefault();
            onCommitAndPush();
          }
        }}
      />

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          onClick={onCommit}
          disabled={!canCommit || isCommitting}
        >
          {isCommitting ? (
            <Spinner size="sm" />
          ) : (
            <>
              <GitCommit className="h-3.5 w-3.5" />
              Commit
            </>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          onClick={onCommitAndPush}
          disabled={!canCommit || isCommitting}
        >
          {isCommitting ? (
            <Spinner size="sm" />
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Commit & Push
            </>
          )}
        </Button>
      </div>

      {/* Keyboard Shortcut Hint */}
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Cmd+Enter</kbd> commit & push
      </div>
    </div>
  );
}

export default CommitPanel;
