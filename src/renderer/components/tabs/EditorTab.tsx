import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  ChevronRight,
  ExternalLink,
  X,
  FolderOpen,
} from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getMonacoLanguageId } from '@/lib/diffUtils';
import { useTheme } from '@/hooks/useTheme';
import { useFileManager } from '@/hooks/useFileManager';
import { useFileChanges } from '@/hooks/useFileChanges';
import { useOpenInApps } from '@/hooks/useOpenInApps';
import { useEditorState } from '@/hooks/useEditorState';
import { FileTree } from '@/components/FileExplorer/FileTree';
import { FileIcon } from '@/components/FileExplorer/FileIcons';
import { DEFAULT_EDITOR_OPTIONS } from '@/constants/file-explorer';

interface EditorTabProps {
  taskPath: string;
  taskName?: string;
  className?: string;
}

export function EditorTab({ taskPath, taskName, className }: EditorTabProps) {
  const { effectiveTheme } = useTheme();
  const { icons, installedApps } = useOpenInApps();
  const { fileChanges } = useFileChanges(taskPath);

  // Editor state from zustand store
  const {
    openFile: storeOpenFile,
    closeFile: storeCloseFile,
    setActiveFile: storeSetActiveFile,
    getOpenFiles,
    getActiveFile,
    markUnsaved,
    markSaved,
    isUnsaved,
  } = useEditorState();

  const openFiles = getOpenFiles(taskPath);
  const activeFile = getActiveFile(taskPath);

  // File manager for loading/saving
  const {
    openFiles: managedFiles,
    activeFile: managedActiveFile,
    hasUnsavedChanges,
    isSaving,
    loadFile,
    saveFile,
    closeFile: managerCloseFile,
    updateFileContent,
    setActiveFile: managerSetActiveFile,
  } = useFileManager({
    taskPath,
    autoSave: true,
  });

  // Track if we've validated files for this taskPath
  const validatedTaskPath = useRef<string | null>(null);

  // Validate and load all persisted files on mount or when taskPath changes
  useEffect(() => {
    // Skip if we've already validated for this taskPath
    if (validatedTaskPath.current === taskPath) return;
    if (!taskPath || openFiles.length === 0) {
      validatedTaskPath.current = taskPath;
      return;
    }

    const validateAndLoadFiles = async () => {
      const validFiles: string[] = [];
      const invalidFiles: string[] = [];

      // Validate each persisted file exists on disk
      for (const filePath of openFiles) {
        try {
          const result = await window.electronAPI.fsRead(taskPath, filePath);
          if (result.success && result.content !== undefined) {
            validFiles.push(filePath);
          } else {
            invalidFiles.push(filePath);
          }
        } catch {
          invalidFiles.push(filePath);
        }
      }

      // Close any invalid files from the editor state
      invalidFiles.forEach((filePath) => {
        storeCloseFile(taskPath, filePath);
      });

      // Load all valid files that aren't already loaded in file manager
      for (const filePath of validFiles) {
        if (!managedFiles.has(filePath)) {
          await loadFile(filePath);
        }
      }

      // If the active file was invalid, set a new active file
      if (activeFile && invalidFiles.includes(activeFile)) {
        if (validFiles.length > 0) {
          storeSetActiveFile(taskPath, validFiles[0]);
          managerSetActiveFile(validFiles[0]);
        }
      } else if (activeFile && validFiles.includes(activeFile)) {
        // Make sure the active file is set in the manager
        managerSetActiveFile(activeFile);
      }

      validatedTaskPath.current = taskPath;
    };

    validateAndLoadFiles();
  }, [taskPath, openFiles, activeFile, storeCloseFile, storeSetActiveFile, loadFile, managedFiles, managerSetActiveFile]);

  // Sync editor state with file manager - load active file content
  useEffect(() => {
    if (activeFile && !managedFiles.has(activeFile)) {
      loadFile(activeFile);
    }
  }, [activeFile, managedFiles, loadFile]);

  // Handle file selection from tree
  const handleSelectFile = useCallback(
    (filePath: string) => {
      storeOpenFile(taskPath, filePath);
      if (!managedFiles.has(filePath)) {
        loadFile(filePath);
      } else {
        managerSetActiveFile(filePath);
      }
    },
    [taskPath, storeOpenFile, managedFiles, loadFile, managerSetActiveFile]
  );

  // Handle file double-click (same as select for now)
  const handleOpenFile = useCallback(
    (filePath: string) => {
      handleSelectFile(filePath);
    },
    [handleSelectFile]
  );

  // Handle tab click
  const handleTabClick = useCallback(
    (filePath: string) => {
      storeSetActiveFile(taskPath, filePath);
      managerSetActiveFile(filePath);
    },
    [taskPath, storeSetActiveFile, managerSetActiveFile]
  );

  // Handle tab close
  const handleTabClose = useCallback(
    (filePath: string) => {
      storeCloseFile(taskPath, filePath);
      managerCloseFile(filePath);
    },
    [taskPath, storeCloseFile, managerCloseFile]
  );

  // Handle content change
  const handleContentChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile || value === undefined) return;
      updateFileContent(activeFile, value);

      const file = managedFiles.get(activeFile);
      if (file && value !== file.originalContent) {
        markUnsaved(taskPath, activeFile);
      } else {
        markSaved(taskPath, activeFile);
      }
    },
    [activeFile, updateFileContent, managedFiles, taskPath, markUnsaved, markSaved]
  );

  // Handle keyboard shortcut for save
  const handleEditorMount = useCallback(
    (editor: any, monaco: any) => {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveFile();
      });
    },
    [saveFile]
  );

  // Open in external app
  const handleOpenInApp = useCallback(
    async (appId: string) => {
      const filePath = activeFile
        ? `${taskPath}/${activeFile}`
        : taskPath;
      try {
        await window.electronAPI?.openIn?.({
          app: appId as any,
          path: filePath,
        });
      } catch (error) {
        console.error('Failed to open in app:', error);
      }
    },
    [taskPath, activeFile]
  );

  // Get current file content
  const currentFile = activeFile ? managedFiles.get(activeFile) : null;
  const fileContent = currentFile?.content || '';
  const isImageFile = currentFile?.content?.startsWith('data:image/');

  // Breadcrumb path
  const breadcrumbPath = useMemo(() => {
    if (!activeFile) return [];
    return activeFile.split('/');
  }, [activeFile]);

  // Filter IDE apps for "Open in IDE" dropdown
  const ideApps = useMemo(() => {
    return installedApps.filter(
      (app) => app.id === 'vscode' || app.id === 'cursor' || app.id === 'zed'
    );
  }, [installedApps]);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* File Tree Panel */}
        <ResizablePanel
          defaultSize={20}
          minSize={15}
          maxSize={40}
          className="flex flex-col"
        >
          {/* File Tree */}
          <FileTree
            rootPath={taskPath}
            selectedFile={activeFile}
            onSelectFile={handleSelectFile}
            onOpenFile={handleOpenFile}
            className="flex-1 overflow-auto"
            fileChanges={fileChanges}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Editor Panel */}
        <ResizablePanel defaultSize={80} minSize={50}>
          <div className="flex h-full flex-col">
            {/* File Tabs */}
            {openFiles.length > 0 && (
              <div className="flex h-9 items-center overflow-x-auto border-b border-border bg-muted/10">
                {openFiles.map((filePath) => {
                  const fileName = filePath.split('/').pop() || 'Untitled';
                  const isActive = filePath === activeFile;
                  const isDirty = isUnsaved(taskPath, filePath);

                  return (
                    <div
                      key={filePath}
                      className={cn(
                        'group flex h-full cursor-pointer items-center gap-1.5 border-r border-border px-3 hover:bg-accent/50',
                        isActive && 'bg-background'
                      )}
                      onClick={() => handleTabClick(filePath)}
                      title={filePath}
                    >
                      <span className="flex-shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
                        <FileIcon filename={fileName} isDirectory={false} />
                      </span>
                      <span className="max-w-[120px] truncate text-xs">
                        {fileName}
                      </span>
                      {isDirty && (
                        <span className="text-amber-500" title="Unsaved changes">
                          *
                        </span>
                      )}
                      <button
                        className="ml-1 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTabClose(filePath);
                        }}
                        aria-label={`Close ${fileName}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Breadcrumb + Actions Bar */}
            {activeFile && (
              <div className="flex h-8 items-center justify-between border-b border-border bg-muted/20 px-3">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FolderOpen className="h-3 w-3" />
                  {breadcrumbPath.map((part, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span
                        className={cn(
                          index === breadcrumbPath.length - 1 &&
                            'text-foreground'
                        )}
                      >
                        {part}
                      </span>
                    </React.Fragment>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && (
                    <span className="text-xs text-amber-500">Unsaved</span>
                  )}

                  {/* Open in IDE Dropdown */}
                  {ideApps.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1.5 px-2 text-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open in IDE
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ideApps.map((app) => (
                          <DropdownMenuItem
                            key={app.id}
                            onClick={() => handleOpenInApp(app.id)}
                            className="gap-2"
                          >
                            {icons[app.id] && (
                              <img
                                src={icons[app.id]}
                                alt={app.label}
                                className="h-4 w-4"
                              />
                            )}
                            {app.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )}

            {/* Editor Content */}
            <div className="flex-1">
              {activeFile ? (
                isImageFile ? (
                  // Image Preview
                  <div className="flex h-full items-center justify-center bg-muted/10 p-4">
                    <img
                      src={fileContent}
                      alt={activeFile}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  // Monaco Editor
                  <Editor
                    height="100%"
                    language={getMonacoLanguageId(activeFile)}
                    value={fileContent}
                    onChange={handleContentChange}
                    onMount={handleEditorMount}
                    theme={
                      effectiveTheme === 'dark' || effectiveTheme === 'dark-black'
                        ? 'vs-dark'
                        : 'vs'
                    }
                    options={DEFAULT_EDITOR_OPTIONS}
                  />
                )
              ) : (
                // Empty State
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 opacity-20" />
                  <p className="text-sm">Select a file to open</p>
                  <p className="text-xs opacity-60">
                    {taskName || 'No project selected'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default EditorTab;
