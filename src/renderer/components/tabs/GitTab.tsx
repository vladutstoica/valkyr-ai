import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMemo } from 'react';
import { Plus, Minus, RefreshCw, ChevronDown, ChevronRight, Columns, AlignJustify, FolderTree, Check, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useFileChanges } from '@/hooks/useFileChanges';
import { useTheme } from '@/hooks/useTheme';
import { useGitState, type FileStatus } from '@/hooks/useGitState';
import { useTabState } from '@/hooks/useTabState';
import { FileChangeItem } from '@/components/git/FileChangeItem';
import { CommitPanel } from '@/components/git/CommitPanel';
import { DiffViewer } from '@/components/git/DiffViewer';

import type { FileChange } from '@/hooks/useGitState';
import type { Task } from '@/types/app';

/** Directory node in the file tree */
interface DirNode {
  name: string;
  fullPath: string;
  files: FileChange[];
  children: DirNode[];
  fileCount: number;
}

/** Build a directory tree from a flat list of files */
function buildDirectoryTree(fileList: FileChange[]): DirNode {
  const root: DirNode = { name: '', fullPath: '', files: [], children: [], fileCount: 0 };

  for (const file of fileList) {
    const parts = file.path.split('/');
    let current = root;

    // Navigate/create directory nodes for all path segments except the filename
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      const dirPath = parts.slice(0, i + 1).join('/');
      let child = current.children.find((c) => c.name === dirName);
      if (!child) {
        child = { name: dirName, fullPath: dirPath, files: [], children: [], fileCount: 0 };
        current.children.push(child);
      }
      current = child;
    }

    current.files.push(file);
  }

  // Count total files per directory (recursive)
  function countFiles(node: DirNode): number {
    let count = node.files.length;
    for (const child of node.children) {
      count += countFiles(child);
    }
    node.fileCount = count;
    return count;
  }
  countFiles(root);

  // Collapse single-child directory chains:
  // src > renderer > components > git (4 levels) → src/renderer/components/git (1 level)
  function collapseSingleChild(node: DirNode): void {
    while (node.children.length === 1 && node.files.length === 0) {
      const onlyChild = node.children[0];
      node.name = node.name ? `${node.name}/${onlyChild.name}` : onlyChild.name;
      node.fullPath = onlyChild.fullPath;
      node.files = onlyChild.files;
      node.children = onlyChild.children;
      // fileCount stays the same
    }
    for (const child of node.children) {
      collapseSingleChild(child);
    }
  }
  // Only collapse children — never the root itself, so renderDirNode
  // always has children to render as directory headers.
  for (const child of root.children) {
    collapseSingleChild(child);
  }

  return root;
}

interface GitTabProps {
  taskId?: string;
  taskPath?: string;
  activeTask?: Task | null;
  selectedProject?: import('@/types/app').Project | null;
  className?: string;
}

/** Strip the repo prefix from a file path to get the path relative to the sub-repo */
function stripRepoPrefix(filePath: string, repoName?: string): string {
  if (!repoName) return filePath;
  const prefix = repoName + '/';
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

/** Group files by their repoName */
function buildRepoGroups(fileList: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const file of fileList) {
    const repo = file.repoName || '(root)';
    const existing = groups.get(repo);
    if (existing) {
      existing.push(file);
    } else {
      groups.set(repo, [file]);
    }
  }
  return groups;
}

export function GitTab({ taskId: _taskId, taskPath, activeTask, selectedProject, className }: GitTabProps) {
  const { toast } = useToast();
  const { effectiveTheme } = useTheme();

  // Derive multi-repo state from task metadata, falling back to project subRepos
  const multiRepo = activeTask?.metadata?.multiRepo;
  const projectSubRepos = selectedProject?.subRepos;
  const repoMappings = useMemo(() => {
    if (multiRepo?.repoMappings?.length) {
      return multiRepo.repoMappings.map((m: { relativePath: string; targetPath: string }) => ({
        relativePath: m.relativePath,
        targetPath: m.targetPath,
      }));
    }
    // Fallback: derive from project subRepos for tasks without multiRepo metadata
    if (projectSubRepos?.length) {
      return projectSubRepos.map((r) => ({
        relativePath: r.relativePath,
        targetPath: r.path,
      }));
    }
    return undefined;
  }, [multiRepo?.repoMappings, projectSubRepos]);
  const isMultiRepo = Boolean(repoMappings?.length);

  // File changes from existing hook
  const { fileChanges, refreshChanges, isLoading: isLoadingChanges } = useFileChanges(taskPath, { repoMappings });

  // Local git state
  const {
    files,
    stagedFiles,
    commitMessage,
    isCommitting,
    isStagingAll,
    selectedFile,
    diffViewMode,
    fileGrouping,
    setFiles,
    toggleStaged,
    stageAll,
    unstageAll,
    setCommitMessage,
    setCommitting,
    setStagingAll,
    setSelectedFile,
    setDiffViewMode,
    toggleFileGrouping,
  } = useGitState();

  // Track tab state for badge
  const setGitChangesCount = useTabState((state) => state.setGitChangesCount);

  // Collapsible section state
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());

  const toggleRepo = useCallback((repoName: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoName)) next.delete(repoName);
      else next.add(repoName);
      return next;
    });
  }, []);

  const toggleDir = useCallback((dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  // Loading states for individual operations
  const [stagingFiles, setStagingFiles] = useState<Set<string>>(new Set());
  const [discardingFiles, setDiscardingFiles] = useState<Set<string>>(new Set());
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [prUrl, setPrUrl] = useState<string | undefined>();

  // Track right panel width for side-by-side availability (Monaco breakpoint = 900px)
  const diffPanelRef = useRef<HTMLDivElement>(null);
  const [canSideBySide, setCanSideBySide] = useState(false);

  useEffect(() => {
    const el = diffPanelRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanSideBySide(entry.contentRect.width >= 900);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Cache for fetched diffs (path -> diff string)
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
        repoName: change.repoName,
        repoCwd: change.repoCwd,
      }));
      setFiles(mappedFiles);
      setGitChangesCount(mappedFiles.length);
    } else {
      setFiles([]);
      setGitChangesCount(0);
    }
  }, [fileChanges, setFiles, setGitChangesCount]);

  // Auto-select first file when files load and no file is selected
  useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0].path);
    }
  }, [files, selectedFile, setSelectedFile]);

  // Clear selected file if it no longer exists in the files array
  useEffect(() => {
    if (selectedFile && files.length > 0 && !files.some((f) => f.path === selectedFile)) {
      setSelectedFile(null);
    }
  }, [files, selectedFile, setSelectedFile]);

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
  const fetchDiff = useCallback(
    async (filePath: string) => {
      if (!taskPath || fileDiffsRef.current.has(filePath) || loadingDiffsRef.current.has(filePath)) {
        return;
      }

      loadingDiffsRef.current.add(filePath);
      setLoadingDiffs(new Set(loadingDiffsRef.current));

      try {
        // For multi-repo, look up the file's repoCwd and strip the repo prefix
        const file = files.find((f) => f.path === filePath);
        const repoCwd = file?.repoCwd;
        const effectivePath = repoCwd ? stripRepoPrefix(filePath, file?.repoName) : filePath;
        const result = await window.electronAPI.getFileDiff({ taskPath, filePath: effectivePath, repoCwd });
        if (result?.success && result.diff) {
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
    [taskPath, files]
  );

  // Fetch diff when selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      fetchDiff(selectedFile);
    }
  }, [selectedFile, fetchDiff]);

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

  // Handle selecting a file
  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedFile(path);
      fetchDiff(path);
    },
    [setSelectedFile, fetchDiff]
  );

  // Handle staging a single file
  const handleToggleStaged = useCallback(
    async (path: string) => {
      if (!taskPath) return;

      const isCurrentlyStaged = stagedFiles.has(path);
      setStagingFiles((prev) => new Set(prev).add(path));

      try {
        // For multi-repo, resolve the correct cwd and stripped path
        const file = files.find((f) => f.path === path);
        const repoCwd = file?.repoCwd;
        const effectivePath = repoCwd ? stripRepoPrefix(path, file?.repoName) : path;

        let result;
        if (isCurrentlyStaged) {
          result = await window.electronAPI.unstageFile({ taskPath, filePath: effectivePath, repoCwd });
        } else {
          result = await window.electronAPI.stageFile({ taskPath, filePath: effectivePath, repoCwd });
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
    [taskPath, stagedFiles, toggleStaged, refreshChanges, toast, files]
  );

  // Handle staging all files
  const handleStageAll = useCallback(async () => {
    if (!taskPath) return;

    setStagingAll(true);
    try {
      // For multi-repo, collect unique repoCwds and pass them
      const repoCwds = isMultiRepo
        ? [...new Set(files.map((f) => f.repoCwd).filter(Boolean))] as string[]
        : undefined;
      const result = await window.electronAPI.stageAllFiles({ taskPath, repoCwds });
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
  }, [taskPath, stageAll, refreshChanges, toast, setStagingAll, isMultiRepo, files]);

  // Handle unstaging all files
  const handleUnstageAll = useCallback(async () => {
    if (!taskPath) return;

    setStagingAll(true);
    try {
      const stagedPaths = Array.from(stagedFiles);
      for (const filePath of stagedPaths) {
        const file = files.find((f) => f.path === filePath);
        const repoCwd = file?.repoCwd;
        const effectivePath = repoCwd ? stripRepoPrefix(filePath, file?.repoName) : filePath;
        await window.electronAPI.unstageFile({ taskPath, filePath: effectivePath, repoCwd });
      }
      unstageAll();
      await refreshChanges();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to unstage files.',
        variant: 'destructive',
      });
    } finally {
      setStagingAll(false);
    }
  }, [taskPath, stagedFiles, unstageAll, refreshChanges, toast, setStagingAll, files]);

  // Handle discarding changes
  const handleDiscard = useCallback(
    async (path: string) => {
      if (!taskPath) return;

      setDiscardingFiles((prev) => new Set(prev).add(path));

      try {
        const file = files.find((f) => f.path === path);
        const repoCwd = file?.repoCwd;
        const effectivePath = repoCwd ? stripRepoPrefix(path, file?.repoName) : path;
        const result = await window.electronAPI.revertFile({ taskPath, filePath: effectivePath, repoCwd });
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
    [taskPath, refreshChanges, toast, files]
  );

  // Handle commit
  const handleCommit = useCallback(async () => {
    if (!taskPath || !commitMessage.trim()) return;

    setCommitting(true);
    try {
      const result = await window.electronAPI.gitCommitAndPush({
        taskPath,
        commitMessage: commitMessage.trim(),
        createBranchIfOnDefault: false,
        branchPrefix: 'feature',
      });

      if (result.success) {
        toast({ title: 'Committed', description: commitMessage.trim() });
        setCommitMessage('');
        await refreshChanges();
      } else {
        toast({ title: 'Commit Failed', description: result.error || 'Failed to commit.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  }, [taskPath, commitMessage, setCommitting, setCommitMessage, refreshChanges, toast]);

  // Handle commit and push
  const handleCommitAndPush = useCallback(async () => {
    if (!taskPath || !commitMessage.trim()) return;

    setCommitting(true);
    try {
      const result = await window.electronAPI.gitCommitAndPush({
        taskPath,
        commitMessage: commitMessage.trim(),
        createBranchIfOnDefault: true,
        branchPrefix: 'feature',
      });

      if (result.success) {
        toast({ title: 'Committed and Pushed', description: commitMessage.trim() });
        setCommitMessage('');
        await refreshChanges();
      } else {
        toast({ title: 'Commit Failed', description: result.error || 'Failed to commit and push.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  }, [taskPath, commitMessage, setCommitting, setCommitMessage, refreshChanges, toast]);

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

  // Split files into staged and unstaged groups
  const stagedFilesList = files.filter((f) => stagedFiles.has(f.path));
  const unstagedFilesList = files.filter((f) => !stagedFiles.has(f.path));

  // Build directory trees for grouped view
  const stagedTree = useMemo(() => buildDirectoryTree(stagedFilesList), [stagedFilesList]);
  const unstagedTree = useMemo(() => buildDirectoryTree(unstagedFilesList), [unstagedFilesList]);

  /** Render a directory tree node recursively */
  const renderDirNode = (node: DirNode, depth: number, isStaged: boolean) => {
    const items: React.ReactNode[] = [];

    // Render child directories
    for (const child of node.children.sort((a, b) => a.name.localeCompare(b.name))) {
      const dirKey = `${isStaged ? 's' : 'u'}:${child.fullPath}`;
      const isCollapsed = collapsedDirs.has(dirKey);

      items.push(
        <button
          key={`dir-${dirKey}`}
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:bg-muted/40"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => toggleDir(dirKey)}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          )}
          <FolderTree className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
          <span className="truncate">{child.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/50">{child.fileCount}</span>
        </button>
      );

      if (!isCollapsed) {
        items.push(...renderDirNode(child, depth + 1, isStaged));
      }
    }

    // Render files at this level
    for (const file of node.files.sort((a, b) => a.path.localeCompare(b.path))) {
      items.push(
        <FileChangeItem
          key={file.path}
          path={file.path}
          status={file.status}
          additions={file.additions}
          deletions={file.deletions}
          isStaged={isStaged}
          isSelected={selectedFile === file.path}
          onToggleStaged={handleToggleStaged}
          onSelect={handleSelectFile}
          onDiscard={handleDiscard}
          isStaging={stagingFiles.has(file.path)}
          isDiscarding={discardingFiles.has(file.path)}
          filenameOnly
          depth={depth + 1}
        />
      );
    }

    return items;
  };

  /** Render files grouped by repository, then optionally by directory within each repo */
  const renderRepoGrouped = (fileList: FileChange[], isStaged: boolean) => {
    const repoGroups = buildRepoGroups(fileList);
    const sortedRepos = [...repoGroups.keys()].sort();

    return sortedRepos.map((repoName) => {
      const repoKey = `${isStaged ? 's' : 'u'}:repo:${repoName}`;
      const repoFiles = repoGroups.get(repoName) || [];
      const isCollapsed = collapsedRepos.has(repoKey);

      return (
        <div key={repoKey}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 bg-muted/20"
            onClick={() => toggleRepo(repoKey)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            )}
            <span className="truncate">{repoName}</span>
            <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground/70">
              {repoFiles.length}
            </span>
          </button>
          {!isCollapsed && (
            <div>
              {fileGrouping.has('directory')
                ? renderDirNode(buildDirectoryTree(repoFiles), 1, isStaged)
                : repoFiles.map((file) => (
                    <FileChangeItem
                      key={file.path}
                      path={file.path}
                      status={file.status}
                      additions={file.additions}
                      deletions={file.deletions}
                      isStaged={isStaged}
                      isSelected={selectedFile === file.path}
                      onToggleStaged={handleToggleStaged}
                      onSelect={handleSelectFile}
                      onDiscard={handleDiscard}
                      isStaging={stagingFiles.has(file.path)}
                      isDiscarding={discardingFiles.has(file.path)}
                      depth={1}
                    />
                  ))}
            </div>
          )}
        </div>
      );
    });
  };

  if (!taskPath) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <p className="text-sm text-muted-foreground">Select a task to view changes</p>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full bg-background', className)}>
      {/* ===== LEFT SIDEBAR: File Tree + Commit Panel ===== */}
      <div className="flex h-full w-[280px] min-w-[220px] flex-col border-r border-border">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              Changes
              {files.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {files.length}
                </span>
              )}
            </span>
            {files.length > 0 && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  +{totalAdditions}
                </span>
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  -{totalDeletions}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {/* Expand / Collapse All (only when directory grouping is active) */}
            {fileGrouping.has('directory') && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Expand all directories"
                  onClick={() => setCollapsedDirs(new Set())}
                >
                  <ChevronsUpDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Collapse all directories"
                  onClick={() => {
                    // Collect all directory keys
                    const allDirKeys = new Set<string>();
                    const collectDirs = (node: DirNode, prefix: string) => {
                      for (const child of node.children) {
                        allDirKeys.add(`${prefix}${child.fullPath}`);
                        collectDirs(child, prefix);
                      }
                    };
                    collectDirs(stagedTree, 's:');
                    collectDirs(unstagedTree, 'u:');
                    setCollapsedDirs(allDirKeys);
                  }}
                >
                  <ChevronsDownUp className="h-3 w-3" />
                </Button>
              </>
            )}
            {/* Group By Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={fileGrouping.size > 0 ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-6 w-6"
                  title="Group by"
                >
                  <FolderTree className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-2 py-1">
                  Group By
                </div>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent',
                    fileGrouping.has('directory') && 'bg-accent'
                  )}
                  onClick={() => toggleFileGrouping('directory')}
                >
                  <span className="w-4">{fileGrouping.has('directory') && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="text-xs">Directory</span>
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent',
                    fileGrouping.has('repository') && 'bg-accent'
                  )}
                  onClick={() => toggleFileGrouping('repository')}
                >
                  <span className="w-4">{fileGrouping.has('repository') && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="text-xs">Repository</span>
                </button>
              </PopoverContent>
            </Popover>
            {/* Refresh */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => refreshChanges()}
              disabled={isLoadingChanges}
            >
              {isLoadingChanges ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        {/* File Tree */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoadingChanges && files.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner size="sm" />
                <span className="text-xs">Loading...</span>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-xs text-muted-foreground">No changes detected</p>
            </div>
          ) : (
            <>
              {/* Staged Changes Section */}
              {stagedFilesList.length > 0 && (
                <div>
                  <div className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-muted/40">
                    <div className="flex items-center gap-1.5">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => handleUnstageAll()}
                          disabled={isStagingAll}
                          className="h-3.5 w-3.5 border-muted-foreground/50 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5"
                        onClick={() => setStagedCollapsed((prev) => !prev)}
                      >
                        {stagedCollapsed ? (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Staged
                        </span>
                        <span className="rounded-full bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          {stagedFilesList.length}
                        </span>
                      </button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 gap-1 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={handleUnstageAll}
                      disabled={isStagingAll}
                    >
                      {isStagingAll ? <Spinner size="sm" /> : <><Minus className="h-2.5 w-2.5" /> Unstage</>}
                    </Button>
                  </div>
                  {!stagedCollapsed && (
                    <div>
                      {fileGrouping.has('repository') && isMultiRepo
                        ? renderRepoGrouped(stagedFilesList, true)
                        : fileGrouping.has('directory')
                          ? renderDirNode(stagedTree, 0, true)
                          : stagedFilesList.map((file) => (
                              <FileChangeItem
                                key={file.path}
                                path={file.path}
                                status={file.status}
                                additions={file.additions}
                                deletions={file.deletions}
                                isStaged={true}
                                isSelected={selectedFile === file.path}
                                onToggleStaged={handleToggleStaged}
                                onSelect={handleSelectFile}
                                onDiscard={handleDiscard}
                                isStaging={stagingFiles.has(file.path)}
                                isDiscarding={discardingFiles.has(file.path)}
                              />
                            ))}
                    </div>
                  )}
                </div>
              )}

              {/* Unstaged Changes Section */}
              {unstagedFilesList.length > 0 && (
                <div>
                  <div className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-muted/40">
                    <div className="flex items-center gap-1.5">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => handleStageAll()}
                          disabled={isStagingAll}
                          className="h-3.5 w-3.5 border-muted-foreground/50 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5"
                        onClick={() => setUnstagedCollapsed((prev) => !prev)}
                      >
                        {unstagedCollapsed ? (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Changes
                        </span>
                        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                          {unstagedFilesList.length}
                        </span>
                      </button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 gap-1 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={handleStageAll}
                      disabled={isStagingAll}
                    >
                      {isStagingAll ? <Spinner size="sm" /> : <><Plus className="h-2.5 w-2.5" /> Stage All</>}
                    </Button>
                  </div>
                  {!unstagedCollapsed && (
                    <div>
                      {fileGrouping.has('repository') && isMultiRepo
                        ? renderRepoGrouped(unstagedFilesList, false)
                        : fileGrouping.has('directory')
                          ? renderDirNode(unstagedTree, 0, false)
                          : unstagedFilesList.map((file) => (
                              <FileChangeItem
                                key={file.path}
                                path={file.path}
                                status={file.status}
                                additions={file.additions}
                                deletions={file.deletions}
                                isStaged={false}
                                isSelected={selectedFile === file.path}
                                onToggleStaged={handleToggleStaged}
                                onSelect={handleSelectFile}
                                onDiscard={handleDiscard}
                                isStaging={stagingFiles.has(file.path)}
                                isDiscarding={discardingFiles.has(file.path)}
                              />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Commit Panel at bottom of sidebar */}
        {files.length > 0 && (
          <CommitPanel
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onCommit={handleCommit}
            onCommitAndPush={handleCommitAndPush}
            isCommitting={isCommitting}
            hasStagedChanges={hasStagedChanges}
            prUrl={prUrl}
          />
        )}
      </div>

      {/* ===== RIGHT PANEL: Diff Viewer ===== */}
      <div ref={diffPanelRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Diff Toolbar */}
        {selectedFile && (
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5">
            <span className="truncate text-xs text-muted-foreground">{selectedFile}</span>
            {canSideBySide && (
              <div className="flex items-center gap-0.5">
                <Button
                  variant={diffViewMode === 'inline' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setDiffViewMode('inline')}
                  title="Inline diff"
                >
                  <AlignJustify className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={diffViewMode === 'side-by-side' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setDiffViewMode('side-by-side')}
                  title="Side-by-side diff"
                >
                  <Columns className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Diff Content — fills entire right panel */}
        <div className="min-h-0 flex-1">
          {selectedFile ? (
            loadingDiffs.has(selectedFile) ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Spinner size="sm" />
                  <span className="text-sm">Loading diff...</span>
                </div>
              </div>
            ) : (
              <DiffViewer
                diff={fileDiffs.get(selectedFile) || ''}
                filePath={selectedFile}
                sideBySide={diffViewMode === 'side-by-side'}
                theme={effectiveTheme}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a file to view changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GitTab;
