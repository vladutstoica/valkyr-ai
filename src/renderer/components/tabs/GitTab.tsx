import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, FileDiff, RefreshCw } from 'lucide-react';
import { preloadHighlighter } from '@pierre/diffs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { useFileChanges } from '@/hooks/useFileChanges';
import { useTheme } from '@/hooks/useTheme';
import { useGitState, type FileStatus, type CommitType } from '@/hooks/useGitState';
import { useTabState } from '@/hooks/useTabState';
import { FileChangeItem } from '@/components/git/FileChangeItem';
import { CommitPanel } from '@/components/git/CommitPanel';

interface GitTabProps {
  taskId?: string;
  taskPath?: string;
  className?: string;
}

export function GitTab({ taskId: _taskId, taskPath, className }: GitTabProps) {
  const { toast } = useToast();
  const { effectiveTheme } = useTheme();

  // File changes from existing hook
  const { fileChanges, refreshChanges, isLoading: isLoadingChanges } = useFileChanges(taskPath);

  // Local git state
  const {
    files,
    stagedFiles,
    expandedFiles,
    commitMessage,
    commitType,
    isCommitting,
    isStagingAll,
    setFiles,
    toggleStaged,
    stageAll,
    toggleExpanded,
    expandAll,
    collapseAll,
    setCommitMessage,
    setCommitType,
    setCommitting,
    setStagingAll,
  } = useGitState();

  // Track tab state for badge
  const setGitChangesCount = useTabState((state) => state.setGitChangesCount);

  // Loading states for individual operations
  const [stagingFiles, setStagingFiles] = useState<Set<string>>(new Set());
  const [discardingFiles, setDiscardingFiles] = useState<Set<string>>(new Set());
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [prUrl, setPrUrl] = useState<string | undefined>();

  // Cache for fetched diffs (path -> diff string)
  // Use refs to track current state without causing callback recreation
  const [fileDiffs, setFileDiffs] = useState<Map<string, string>>(new Map());
  const [loadingDiffs, setLoadingDiffs] = useState<Set<string>>(new Set());
  const fileDiffsRef = useRef<Map<string, string>>(new Map());
  const loadingDiffsRef = useRef<Set<string>>(new Set());

  // Sync file changes to local state
  useEffect(() => {
    if (fileChanges.length > 0) {
      const mappedFiles = fileChanges.map((change) => ({
        path: change.path,
        status: mapStatus(change.status),
        additions: change.additions,
        deletions: change.deletions,
        diff: change.diff,
        isStaged: change.isStaged,
      }));
      setFiles(mappedFiles);
      setGitChangesCount(mappedFiles.length);
    } else {
      setFiles([]);
      setGitChangesCount(0);
    }
  }, [fileChanges, setFiles, setGitChangesCount]);

  // Check for existing PR
  useEffect(() => {
    if (!taskPath) return;

    const checkPrStatus = async () => {
      try {
        const result = await window.electronAPI.getPrStatus({ taskPath });
        if (result?.success && result.pr?.url) {
          setPrUrl(result.pr.url);
        } else {
          setPrUrl(undefined);
        }
      } catch {
        setPrUrl(undefined);
      }
    };

    checkPrStatus();
  }, [taskPath]);

  // Fetch diff for a file
  // Uses refs to check state without recreating the callback (prevents infinite loops)
  const fetchDiff = useCallback(
    async (filePath: string) => {
      // Use refs to check current state without causing callback recreation
      if (!taskPath || fileDiffsRef.current.has(filePath) || loadingDiffsRef.current.has(filePath)) {
        return;
      }

      // Update ref and state
      loadingDiffsRef.current.add(filePath);
      setLoadingDiffs(new Set(loadingDiffsRef.current));

      try {
        const result = await window.electronAPI.getFileDiff({ taskPath, filePath });
        if (result?.success && result.diff) {
          // Use rawPatch if available (complete unified diff with headers)
          // Otherwise fall back to reconstructing from lines
          let patch: string;
          if (result.diff.rawPatch) {
            patch = result.diff.rawPatch;
          } else {
            const lines = result.diff.lines || [];
            const patchLines: string[] = [];
            for (const line of lines) {
              if (line.type === 'context') {
                patchLines.push(` ${line.left || line.right || ''}`);
              } else if (line.type === 'del') {
                patchLines.push(`-${line.left || ''}`);
              } else if (line.type === 'add') {
                patchLines.push(`+${line.right || ''}`);
              }
            }
            patch = patchLines.join('\n');
          }
          // Update ref and state
          fileDiffsRef.current.set(filePath, patch);
          setFileDiffs(new Map(fileDiffsRef.current));
        }
      } catch (err) {
        console.error('Failed to fetch diff for', filePath, err);
      } finally {
        loadingDiffsRef.current.delete(filePath);
        setLoadingDiffs(new Set(loadingDiffsRef.current));
      }
    },
    [taskPath] // Only depends on taskPath now - stable callback
  );

  // Handle expand toggle with diff fetching
  const handleToggleExpanded = useCallback(
    (path: string) => {
      const isCurrentlyExpanded = expandedFiles.has(path);
      toggleExpanded(path);

      // Fetch diff when expanding (if not already fetched)
      if (!isCurrentlyExpanded) {
        fetchDiff(path);
      }
    },
    [expandedFiles, toggleExpanded, fetchDiff]
  );

  // Handle expand all with batched diff fetching to prevent overwhelming the renderer
  const handleExpandAll = useCallback(async () => {
    // Use ref to check current state without callback recreation
    const filesToFetch = files.filter((file) => !fileDiffsRef.current.has(file.path));

    // Batch size - fetch 3 diffs at a time to prevent overwhelming the system
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 100;

    // Process files in batches
    for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
      const batch = filesToFetch.slice(i, i + BATCH_SIZE);

      // Expand and fetch this batch
      batch.forEach((file) => {
        if (!expandedFiles.has(file.path)) {
          toggleExpanded(file.path);
        }
        fetchDiff(file.path);
      });

      // Small delay between batches to let React render
      if (i + BATCH_SIZE < filesToFetch.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Expand any remaining files that already have cached diffs
    files.forEach((file) => {
      if (!expandedFiles.has(file.path) && fileDiffsRef.current.has(file.path)) {
        toggleExpanded(file.path);
      }
    });
  }, [files, expandedFiles, toggleExpanded, fetchDiff]);

  // Preload Shiki highlighter themes and languages to eliminate cold-start latency
  useEffect(() => {
    preloadHighlighter({
      themes: ['pierre-dark', 'pierre-light'],
      langs: [
        'typescript',
        'javascript',
        'tsx',
        'jsx',
        'css',
        'scss',
        'json',
        'html',
        'python',
        'rust',
        'go',
        'java',
        'markdown',
        'yaml',
        'bash',
        'shell',
      ],
    }).catch((err) => {
      console.warn('[GitTab] Failed to preload highlighter:', err);
    });
  }, []);

  // Map status string to FileStatus type
  const mapStatus = (status: string): FileStatus => {
    switch (status) {
      case 'added':
        return 'A';
      case 'deleted':
        return 'D';
      case 'renamed':
        return 'R';
      case 'modified':
      default:
        return 'M';
    }
  };

  // Handle staging a single file
  const handleToggleStaged = useCallback(
    async (path: string) => {
      if (!taskPath) return;

      const isCurrentlyStaged = stagedFiles.has(path);
      setStagingFiles((prev) => new Set(prev).add(path));

      try {
        let result;
        if (isCurrentlyStaged) {
          result = await window.electronAPI.unstageFile({ taskPath, filePath: path });
        } else {
          result = await window.electronAPI.stageFile({ taskPath, filePath: path });
        }

        if (result.success) {
          toggleStaged(path);
          await refreshChanges();
        } else {
          toast({
            title: isCurrentlyStaged ? 'Unstage Failed' : 'Stage Failed',
            description: result.error || 'Failed to update file staging.',
            variant: 'destructive',
          });
        }
      } catch {
        toast({
          title: 'Error',
          description: 'An unexpected error occurred.',
          variant: 'destructive',
        });
      } finally {
        setStagingFiles((prev) => {
          const newSet = new Set(prev);
          newSet.delete(path);
          return newSet;
        });
      }
    },
    [taskPath, stagedFiles, toggleStaged, refreshChanges, toast]
  );

  // Handle staging all files
  const handleStageAll = useCallback(async () => {
    if (!taskPath) return;

    setStagingAll(true);
    try {
      const result = await window.electronAPI.stageAllFiles({ taskPath });
      if (result.success) {
        stageAll();
        await refreshChanges();
      } else {
        toast({
          title: 'Stage All Failed',
          description: result.error || 'Failed to stage all files.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setStagingAll(false);
    }
  }, [taskPath, stageAll, refreshChanges, toast, setStagingAll]);

  // Handle discarding changes
  const handleDiscard = useCallback(
    async (path: string) => {
      if (!taskPath) return;

      setDiscardingFiles((prev) => new Set(prev).add(path));

      try {
        const result = await window.electronAPI.revertFile({ taskPath, filePath: path });
        if (result.success) {
          if (result.action !== 'unstaged') {
            toast({
              title: 'File Reverted',
              description: `${path} changes have been reverted.`,
            });
          }
          await refreshChanges();
        } else {
          toast({
            title: 'Revert Failed',
            description: result.error || 'Failed to revert file.',
            variant: 'destructive',
          });
        }
      } catch {
        toast({
          title: 'Error',
          description: 'An unexpected error occurred.',
          variant: 'destructive',
        });
      } finally {
        setDiscardingFiles((prev) => {
          const newSet = new Set(prev);
          newSet.delete(path);
          return newSet;
        });
      }
    },
    [taskPath, refreshChanges, toast]
  );

  // Handle commit
  const handleCommit = useCallback(async () => {
    if (!taskPath || !commitMessage.trim()) return;

    // Format message with commit type
    const formattedMessage = commitMessage.trim().startsWith(`${commitType}:`)
      ? commitMessage.trim()
      : `${commitType}: ${commitMessage.trim()}`;

    setCommitting(true);
    try {
      const result = await window.electronAPI.gitCommitAndPush({
        taskPath,
        commitMessage: formattedMessage,
        createBranchIfOnDefault: false, // Just commit, don't push
        branchPrefix: 'feature',
      });

      if (result.success) {
        toast({
          title: 'Committed',
          description: `Changes committed with message: "${formattedMessage}"`,
        });
        setCommitMessage('');
        await refreshChanges();
      } else {
        toast({
          title: 'Commit Failed',
          description: result.error || 'Failed to commit changes.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
    }
  }, [taskPath, commitMessage, commitType, setCommitting, setCommitMessage, refreshChanges, toast]);

  // Handle commit and push
  const handleCommitAndPush = useCallback(async () => {
    if (!taskPath || !commitMessage.trim()) return;

    // Format message with commit type
    const formattedMessage = commitMessage.trim().startsWith(`${commitType}:`)
      ? commitMessage.trim()
      : `${commitType}: ${commitMessage.trim()}`;

    setCommitting(true);
    try {
      const result = await window.electronAPI.gitCommitAndPush({
        taskPath,
        commitMessage: formattedMessage,
        createBranchIfOnDefault: true,
        branchPrefix: 'feature',
      });

      if (result.success) {
        toast({
          title: 'Committed and Pushed',
          description: `Changes committed with message: "${formattedMessage}"`,
        });
        setCommitMessage('');
        await refreshChanges();
      } else {
        toast({
          title: 'Commit Failed',
          description: result.error || 'Failed to commit and push changes.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
    }
  }, [taskPath, commitMessage, commitType, setCommitting, setCommitMessage, refreshChanges, toast]);

  // Handle PR creation
  const handleCreatePR = useCallback(
    async (mode: 'create' | 'draft' | 'merge') => {
      if (!taskPath) return;

      setIsCreatingPR(true);
      try {
        if (mode === 'merge') {
          const result = await window.electronAPI.mergeToMain({ taskPath });
          if (result.success) {
            toast({
              title: 'Merged to Main',
              description: 'Changes have been merged to main.',
            });
            await refreshChanges();
          } else {
            toast({
              title: 'Merge Failed',
              description: result.error || 'Failed to merge to main.',
              variant: 'destructive',
            });
          }
        } else {
          const result = await window.electronAPI.createPullRequest({
            taskPath,
            draft: mode === 'draft',
          });

          if (result.success) {
            toast({
              title: mode === 'draft' ? 'Draft PR Created' : 'PR Created',
              description: result.url || 'Pull request created successfully.',
            });
            if (result.url) {
              setPrUrl(result.url);
            }
            await refreshChanges();
          } else {
            toast({
              title: 'PR Creation Failed',
              description: result.error || 'Failed to create pull request.',
              variant: 'destructive',
            });
          }
        }
      } catch {
        toast({
          title: 'Error',
          description: 'An unexpected error occurred.',
          variant: 'destructive',
        });
      } finally {
        setIsCreatingPR(false);
      }
    },
    [taskPath, refreshChanges, toast]
  );

  // Calculate stats
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const stagedCount = Array.from(stagedFiles).filter((p) => files.some((f) => f.path === p)).length;
  const hasStagedChanges = stagedCount > 0;
  const hasUnstagedChanges = files.some((f) => !stagedFiles.has(f.path));

  if (!taskPath) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <p className="text-sm text-muted-foreground">Select a task to view changes</p>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            Changes
            {files.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {files.length}
              </span>
            )}
          </span>

          {/* Stats */}
          {files.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                +{totalAdditions}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-rose-600 dark:text-rose-400">
                -{totalDeletions}
              </span>
            </div>
          )}

          {hasStagedChanges && (
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {stagedCount} staged
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {hasUnstagedChanges && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={handleStageAll}
              disabled={isStagingAll}
            >
              {isStagingAll ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  Stage All
                </>
              )}
            </Button>
          )}

          {files.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={expandedFiles.size > 0 ? collapseAll : handleExpandAll}
            >
              <FileDiff className="h-3 w-3" />
              {expandedFiles.size > 0 ? 'Collapse All' : 'Expand All'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refreshChanges()}
            disabled={isLoadingChanges}
          >
            {isLoadingChanges ? (
              <Spinner size="sm" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* File List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoadingChanges && files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner size="sm" />
              <span className="text-sm">Loading changes...</span>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No changes detected</p>
          </div>
        ) : (
          <div>
            {files.map((file) => (
              <FileChangeItem
                key={file.path}
                path={file.path}
                status={file.status}
                additions={file.additions}
                deletions={file.deletions}
                isStaged={stagedFiles.has(file.path)}
                isExpanded={expandedFiles.has(file.path)}
                diff={fileDiffs.get(file.path)}
                isLoadingDiff={loadingDiffs.has(file.path)}
                onToggleStaged={handleToggleStaged}
                onToggleExpanded={handleToggleExpanded}
                onDiscard={handleDiscard}
                isStaging={stagingFiles.has(file.path)}
                isDiscarding={discardingFiles.has(file.path)}
                theme={effectiveTheme}
              />
            ))}
          </div>
        )}
      </div>

      {/* Commit Panel */}
      {files.length > 0 && (
        <CommitPanel
          commitMessage={commitMessage}
          commitType={commitType as CommitType}
          onCommitMessageChange={setCommitMessage}
          onCommitTypeChange={setCommitType}
          onCommit={handleCommit}
          onCommitAndPush={handleCommitAndPush}
          onCreatePR={handleCreatePR}
          isCommitting={isCommitting}
          isCreatingPR={isCreatingPR}
          hasStagedChanges={hasStagedChanges}
          prUrl={prUrl}
        />
      )}
    </div>
  );
}

export default GitTab;
