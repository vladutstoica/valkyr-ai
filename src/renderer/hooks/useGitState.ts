import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FileStatus = 'M' | 'A' | 'D' | 'R';

export interface FileChange {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  diff?: string;
  isStaged: boolean;
}

interface GitState {
  // File changes
  files: FileChange[];
  stagedFiles: Set<string>;
  expandedFiles: Set<string>;

  // Commit state
  commitMessage: string;
  commitType: string;

  // Loading states
  isLoading: boolean;
  isStagingAll: boolean;
  isCommitting: boolean;

  // Error state
  error: string | null;

  // Actions
  setFiles: (files: FileChange[]) => void;
  toggleStaged: (path: string) => void;
  stageAll: () => void;
  unstageAll: () => void;
  toggleExpanded: (path: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  setCommitMessage: (msg: string) => void;
  setCommitType: (type: string) => void;
  setLoading: (loading: boolean) => void;
  setStagingAll: (staging: boolean) => void;
  setCommitting: (committing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const COMMIT_TYPES = [
  { value: 'feat', label: 'feat', description: 'New feature' },
  { value: 'fix', label: 'fix', description: 'Bug fix' },
  { value: 'refactor', label: 'refactor', description: 'Code refactoring' },
  { value: 'docs', label: 'docs', description: 'Documentation' },
  { value: 'test', label: 'test', description: 'Tests' },
  { value: 'chore', label: 'chore', description: 'Maintenance' },
  { value: 'style', label: 'style', description: 'Code style' },
  { value: 'perf', label: 'perf', description: 'Performance' },
  { value: 'ci', label: 'ci', description: 'CI/CD' },
  { value: 'build', label: 'build', description: 'Build system' },
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number]['value'];

export { COMMIT_TYPES };

export const useGitState = create<GitState>()(
  persist(
    (set, get) => ({
      // Initial state
      files: [],
      stagedFiles: new Set(),
      expandedFiles: new Set(),
      commitMessage: '',
      commitType: 'feat',
      isLoading: false,
      isStagingAll: false,
      isCommitting: false,
      error: null,

      // Actions
      setFiles: (files) => {
        // Update staged files based on isStaged property from each file
        const newStagedFiles = new Set<string>();
        files.forEach((file) => {
          if (file.isStaged) {
            newStagedFiles.add(file.path);
          }
        });
        set({ files, stagedFiles: newStagedFiles });
      },

      toggleStaged: (path) => {
        const { stagedFiles } = get();
        const newStagedFiles = new Set(stagedFiles);
        if (newStagedFiles.has(path)) {
          newStagedFiles.delete(path);
        } else {
          newStagedFiles.add(path);
        }
        set({ stagedFiles: newStagedFiles });
      },

      stageAll: () => {
        const { files } = get();
        const newStagedFiles = new Set(files.map((f) => f.path));
        set({ stagedFiles: newStagedFiles });
      },

      unstageAll: () => {
        set({ stagedFiles: new Set() });
      },

      toggleExpanded: (path) => {
        const { expandedFiles } = get();
        const newExpandedFiles = new Set(expandedFiles);
        if (newExpandedFiles.has(path)) {
          newExpandedFiles.delete(path);
        } else {
          newExpandedFiles.add(path);
        }
        set({ expandedFiles: newExpandedFiles });
      },

      expandAll: () => {
        const { files } = get();
        const newExpandedFiles = new Set(files.map((f) => f.path));
        set({ expandedFiles: newExpandedFiles });
      },

      collapseAll: () => {
        set({ expandedFiles: new Set() });
      },

      setCommitMessage: (msg) => set({ commitMessage: msg }),

      setCommitType: (type) => set({ commitType: type }),

      setLoading: (loading) => set({ isLoading: loading }),

      setStagingAll: (staging) => set({ isStagingAll: staging }),

      setCommitting: (committing) => set({ isCommitting: committing }),

      setError: (error) => set({ error }),

      reset: () =>
        set({
          files: [],
          stagedFiles: new Set(),
          expandedFiles: new Set(),
          commitMessage: '',
          commitType: 'feat',
          isLoading: false,
          isStagingAll: false,
          isCommitting: false,
          error: null,
        }),
    }),
    {
      name: 'git-state',
      partialize: (state) => ({
        commitType: state.commitType,
        // Don't persist files or staged state - those should be fresh on load
      }),
    }
  )
);
