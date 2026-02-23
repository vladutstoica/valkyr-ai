import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EditorState {
  // Open files per task (keyed by taskPath)
  openFilesByTask: Record<string, string[]>;
  activeFileByTask: Record<string, string | null>;
  unsavedFiles: Set<string>;

  // Actions
  openFile: (taskPath: string, filePath: string) => void;
  closeFile: (taskPath: string, filePath: string) => void;
  setActiveFile: (taskPath: string, filePath: string | null) => void;
  markUnsaved: (taskPath: string, filePath: string) => void;
  markSaved: (taskPath: string, filePath: string) => void;
  getOpenFiles: (taskPath: string) => string[];
  getActiveFile: (taskPath: string) => string | null;
  isUnsaved: (taskPath: string, filePath: string) => boolean;
  closeAllFiles: (taskPath: string) => void;
  cleanupInvalidFiles: (taskPath: string, validFiles: string[]) => void;
}

// Helper to create a unique key for unsaved tracking
const makeUnsavedKey = (taskPath: string, filePath: string) => `${taskPath}::${filePath}`;

export const useEditorState = create<EditorState>()(
  persist(
    (set, get) => ({
      openFilesByTask: {},
      activeFileByTask: {},
      unsavedFiles: new Set(),

      openFile: (taskPath, filePath) => {
        set((state) => {
          const currentFiles = state.openFilesByTask[taskPath] || [];
          // Don't add if already open
          if (currentFiles.includes(filePath)) {
            return {
              activeFileByTask: {
                ...state.activeFileByTask,
                [taskPath]: filePath,
              },
            };
          }
          return {
            openFilesByTask: {
              ...state.openFilesByTask,
              [taskPath]: [...currentFiles, filePath],
            },
            activeFileByTask: {
              ...state.activeFileByTask,
              [taskPath]: filePath,
            },
          };
        });
      },

      closeFile: (taskPath, filePath) => {
        set((state) => {
          const currentFiles = state.openFilesByTask[taskPath] || [];
          const newFiles = currentFiles.filter((f) => f !== filePath);
          const currentActive = state.activeFileByTask[taskPath];

          // Remove from unsaved set
          const newUnsaved = new Set(state.unsavedFiles);
          newUnsaved.delete(makeUnsavedKey(taskPath, filePath));

          // If closing the active file, switch to another
          let newActive = currentActive;
          if (currentActive === filePath) {
            const closingIndex = currentFiles.indexOf(filePath);
            if (newFiles.length > 0) {
              // Try to select the file to the left, or the first file
              newActive = newFiles[Math.max(0, closingIndex - 1)] || newFiles[0];
            } else {
              newActive = null;
            }
          }

          return {
            openFilesByTask: {
              ...state.openFilesByTask,
              [taskPath]: newFiles,
            },
            activeFileByTask: {
              ...state.activeFileByTask,
              [taskPath]: newActive,
            },
            unsavedFiles: newUnsaved,
          };
        });
      },

      setActiveFile: (taskPath, filePath) => {
        set((state) => ({
          activeFileByTask: {
            ...state.activeFileByTask,
            [taskPath]: filePath,
          },
        }));
      },

      markUnsaved: (taskPath, filePath) => {
        set((state) => {
          const newUnsaved = new Set(state.unsavedFiles);
          newUnsaved.add(makeUnsavedKey(taskPath, filePath));
          return { unsavedFiles: newUnsaved };
        });
      },

      markSaved: (taskPath, filePath) => {
        set((state) => {
          const newUnsaved = new Set(state.unsavedFiles);
          newUnsaved.delete(makeUnsavedKey(taskPath, filePath));
          return { unsavedFiles: newUnsaved };
        });
      },

      getOpenFiles: (taskPath) => {
        return get().openFilesByTask[taskPath] || [];
      },

      getActiveFile: (taskPath) => {
        return get().activeFileByTask[taskPath] || null;
      },

      isUnsaved: (taskPath, filePath) => {
        return get().unsavedFiles.has(makeUnsavedKey(taskPath, filePath));
      },

      closeAllFiles: (taskPath) => {
        set((state) => {
          const newUnsaved = new Set(state.unsavedFiles);
          // Remove all unsaved keys for this task
          const currentFiles = state.openFilesByTask[taskPath] || [];
          currentFiles.forEach((f) => {
            newUnsaved.delete(makeUnsavedKey(taskPath, f));
          });

          const newOpenFiles = { ...state.openFilesByTask };
          delete newOpenFiles[taskPath];

          const newActiveFiles = { ...state.activeFileByTask };
          delete newActiveFiles[taskPath];

          return {
            openFilesByTask: newOpenFiles,
            activeFileByTask: newActiveFiles,
            unsavedFiles: newUnsaved,
          };
        });
      },

      cleanupInvalidFiles: (taskPath, validFiles) => {
        set((state) => {
          const currentFiles = state.openFilesByTask[taskPath] || [];
          const validSet = new Set(validFiles);
          const filteredFiles = currentFiles.filter((f) => validSet.has(f));

          // Check if active file is still valid
          const currentActive = state.activeFileByTask[taskPath];
          const newActive =
            currentActive && validSet.has(currentActive) ? currentActive : filteredFiles[0] || null;

          // Clean up unsaved set
          const newUnsaved = new Set(state.unsavedFiles);
          currentFiles.forEach((f) => {
            if (!validSet.has(f)) {
              newUnsaved.delete(makeUnsavedKey(taskPath, f));
            }
          });

          return {
            openFilesByTask: {
              ...state.openFilesByTask,
              [taskPath]: filteredFiles,
            },
            activeFileByTask: {
              ...state.activeFileByTask,
              [taskPath]: newActive,
            },
            unsavedFiles: newUnsaved,
          };
        });
      },
    }),
    {
      name: 'editor-state',
      partialize: (state) => ({
        openFilesByTask: state.openFilesByTask,
        activeFileByTask: state.activeFileByTask,
      }),
      // Custom serialization for Set
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          if (!value) return null;
          const parsed = JSON.parse(value);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              unsavedFiles: new Set(),
            },
          };
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
