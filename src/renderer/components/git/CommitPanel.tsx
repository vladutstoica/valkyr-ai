import * as React from 'react';
import { useState } from 'react';
import { ChevronDown, GitCommit, GitPullRequest, Send, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Close as PopoverClose } from '@radix-ui/react-popover';
import { Spinner } from '@/components/ui/spinner';
import { COMMIT_TYPES, type CommitType } from '@/hooks/useGitState';
type PrMode = 'create' | 'draft' | 'merge';

const PR_MODE_LABELS: Record<PrMode, string> = {
  create: 'Create PR',
  draft: 'Draft PR',
  merge: 'Merge Main',
};

export interface CommitPanelProps {
  commitMessage: string;
  commitType: CommitType;
  onCommitMessageChange: (message: string) => void;
  onCommitTypeChange: (type: CommitType) => void;
  onCommit: () => void;
  onCommitAndPush: () => void;
  onCreatePR: (mode: PrMode) => void;
  isCommitting: boolean;
  isCreatingPR: boolean;
  hasStagedChanges: boolean;
  hasUnpushedCommits?: boolean;
  prUrl?: string;
  className?: string;
}

export function CommitPanel({
  commitMessage,
  commitType,
  onCommitMessageChange,
  onCommitTypeChange,
  onCommit,
  onCommitAndPush,
  onCreatePR,
  isCommitting,
  isCreatingPR,
  hasStagedChanges,
  hasUnpushedCommits = false,
  prUrl,
  className,
}: CommitPanelProps) {
  const [prMode, setPrMode] = useState<PrMode>('create');

  const formatCommitMessage = () => {
    const message = commitMessage.trim();
    if (!message) return '';
    // If message already starts with a commit type prefix, return as-is
    if (COMMIT_TYPES.some((t) => message.startsWith(`${t.value}:`))) {
      return message;
    }
    return `${commitType}: ${message}`;
  };

  const handleCommit = () => {
    const formattedMessage = formatCommitMessage();
    if (formattedMessage) {
      onCommit();
    }
  };

  const handleCommitAndPush = () => {
    const formattedMessage = formatCommitMessage();
    if (formattedMessage) {
      onCommitAndPush();
    }
  };

  const handlePrAction = () => {
    onCreatePR(prMode);
  };

  const canCommit = hasStagedChanges && commitMessage.trim().length > 0;

  return (
    <div className={cn('border-t border-border bg-muted/30 p-3', className)}>
      {/* Commit Section Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Commit
        </span>
        {prUrl && (
          <button
            type="button"
            onClick={() => window.electronAPI?.openExternal?.(prUrl)}
            className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View PR
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Commit Type Selector */}
      <div className="mb-2 flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-[90px] justify-between gap-1 px-2 text-xs"
            >
              <span className="font-mono">{commitType}</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1">
            {COMMIT_TYPES.map((type) => (
              <PopoverClose key={type.value} asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                    commitType === type.value && 'bg-accent'
                  )}
                  onClick={() => onCommitTypeChange(type.value)}
                >
                  <span className="w-16 font-mono text-xs font-medium">{type.value}</span>
                  <span className="text-xs text-muted-foreground">{type.description}</span>
                </button>
              </PopoverClose>
            ))}
          </PopoverContent>
        </Popover>

        <span className="text-xs text-muted-foreground">:</span>
      </div>

      {/* Commit Message */}
      <Textarea
        placeholder="Enter commit message..."
        value={commitMessage}
        onChange={(e) => onCommitMessageChange(e.target.value)}
        className="mb-3 min-h-[60px] resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit) {
            e.preventDefault();
            handleCommitAndPush();
          }
        }}
      />

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Commit Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={handleCommit}
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

        {/* Commit & Push Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={handleCommitAndPush}
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

        {/* PR Button with Mode Selector */}
        {(hasStagedChanges || hasUnpushedCommits) && (
          <div className="ml-auto flex min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-0 truncate rounded-r-none border-r-0 gap-1.5 px-2 text-xs"
              disabled={isCreatingPR}
              onClick={handlePrAction}
            >
              {isCreatingPR ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <GitPullRequest className="h-3.5 w-3.5" />
                  {PR_MODE_LABELS[prMode]}
                </>
              )}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-l-none px-1.5"
                  disabled={isCreatingPR}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto min-w-0 p-0.5">
                {(['create', 'draft', 'merge'] as PrMode[])
                  .filter((m) => m !== prMode)
                  .map((m) => (
                    <PopoverClose key={m} asChild>
                      <button
                        className="w-full whitespace-nowrap rounded px-2 py-1 text-left text-xs hover:bg-accent"
                        onClick={() => setPrMode(m)}
                      >
                        {PR_MODE_LABELS[m]}
                      </button>
                    </PopoverClose>
                  ))}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Keyboard Shortcut Hint */}
      <div className="mt-2 text-[10px] text-muted-foreground">
        Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Cmd+Enter</kbd> to commit and
        push
      </div>
    </div>
  );
}

export default CommitPanel;
