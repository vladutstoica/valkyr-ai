import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileIcon } from './FileIcons';
import type { FileChange } from '@/hooks/useFileChanges';

export interface FileNode {
  id: string;
  name: string;
  path: string;       // Relative path from root
  fullPath: string;   // Absolute path
  type: 'file' | 'directory';
  children?: FileNode[];
  isLoading?: boolean;
  isLoaded?: boolean;
  isIgnored?: boolean;
}

interface FileTreeProps {
  rootPath: string;
  selectedFile?: string | null;
  onSelectFile: (path: string) => void;
  onOpenFile?: (path: string) => void;
  className?: string;
  showHiddenFiles?: boolean;
  excludePatterns?: string[];
  fileChanges?: FileChange[];
}

// Tree node component
const TreeNode: React.FC<{
  node: FileNode;
  level: number;
  selectedPath?: string | null;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  onToggleExpand: (node: FileNode) => void;
  onSelect: (path: string) => void;
  onOpen?: (path: string) => void;
  fileChanges: FileChange[];
}> = ({
  node,
  level,
  selectedPath,
  expandedPaths,
  loadingPaths,
  onToggleExpand,
  onSelect,
  onOpen,
  fileChanges,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isLoading = loadingPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const fileStatus = fileChanges.find((change) => change.path === node.path)?.status;
  const isHidden = node.name.startsWith('.');
  const isIgnored = node.isIgnored;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'directory') {
      onToggleExpand(node);
    } else {
      onSelect(node.path);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'file' && onOpen) {
      onOpen(node.path);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex h-6 cursor-pointer select-none items-center px-1 hover:bg-accent/50',
          isSelected && 'bg-accent',
          isHidden && 'opacity-60'
        )}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={node.type === 'directory' ? isExpanded : undefined}
      >
        {node.type === 'directory' && (
          <span className="mr-1 text-muted-foreground">
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
        {node.type === 'file' && (
          <span className="mr-1.5">
            <FileIcon filename={node.name} isDirectory={false} isExpanded={false} />
          </span>
        )}
        <span
          className={cn(
            'flex-1 truncate text-sm',
            // Git status colors (highest priority)
            fileStatus === 'added' && 'text-green-500',
            fileStatus === 'modified' && 'text-amber-500',
            fileStatus === 'deleted' && 'text-red-500 line-through',
            fileStatus === 'renamed' && 'text-blue-500',
            // Ignored files (dimmed, lower priority than git status)
            !fileStatus && isIgnored && 'text-muted-foreground opacity-50'
          )}
        >
          {node.name}
        </span>
      </div>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              loadingPaths={loadingPaths}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onOpen={onOpen}
              fileChanges={fileChanges}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({
  rootPath,
  selectedFile,
  onSelectFile,
  onOpenFile,
  className,
  showHiddenFiles = false,
  fileChanges = [],
}) => {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load a directory's contents
  const loadDirectory = useCallback(
    async (dirPath: string, fullPath: string): Promise<FileNode[]> => {
      const result = await window.electronAPI.fsReaddir(fullPath);

      if (!result.success || !result.items) {
        console.error('Failed to load directory:', result.error);
        return [];
      }

      const filteredItems = result.items.filter(
        (item) => showHiddenFiles || !item.name.startsWith('.')
      );

      // Build paths for git ignore check
      const paths = filteredItems.map((item) =>
        dirPath ? `${dirPath}/${item.name}` : item.name
      );

      // Check which paths are ignored by git
      let ignoredSet = new Set<string>();
      if (paths.length > 0) {
        const ignoreResult = await window.electronAPI.fsCheckIgnored(rootPath, paths);
        if (ignoreResult.success && ignoreResult.ignoredPaths) {
          ignoredSet = new Set(ignoreResult.ignoredPaths);
        }
      }

      return filteredItems.map((item) => {
        const relativePath = dirPath ? `${dirPath}/${item.name}` : item.name;
        const itemFullPath = `${fullPath}/${item.name}`;
        return {
          id: relativePath,
          name: item.name,
          path: relativePath,
          fullPath: itemFullPath,
          type: item.type === 'dir' ? 'directory' : 'file',
          children: item.type === 'dir' ? [] : undefined,
          isLoaded: false,
          isIgnored: ignoredSet.has(relativePath),
        } as FileNode;
      });
    },
    [showHiddenFiles, rootPath]
  );

  // Load root directory on mount or when rootPath changes
  useEffect(() => {
    let cancelled = false;

    const loadRoot = async () => {
      if (!rootPath) {
        setError('No path provided');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nodes = await loadDirectory('', rootPath);
        if (!cancelled) {
          setTree(nodes);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load files');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRoot();

    return () => {
      cancelled = true;
    };
  }, [rootPath, loadDirectory]);

  // Toggle expand/collapse with lazy loading
  const handleToggleExpand = useCallback(
    async (node: FileNode) => {
      const isCurrentlyExpanded = expandedPaths.has(node.path);

      if (isCurrentlyExpanded) {
        // Collapse
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(node.path);
          return next;
        });
      } else {
        // Expand - load children if not loaded
        if (!node.isLoaded) {
          setLoadingPaths((prev) => new Set(prev).add(node.path));

          try {
            const children = await loadDirectory(node.path, node.fullPath);

            setTree((currentTree) => {
              const updateNode = (nodes: FileNode[]): FileNode[] => {
                return nodes.map((n) => {
                  if (n.path === node.path) {
                    return { ...n, children, isLoaded: true };
                  }
                  if (n.children && n.children.length > 0) {
                    return { ...n, children: updateNode(n.children) };
                  }
                  return n;
                });
              };
              return updateNode(currentTree);
            });
          } finally {
            setLoadingPaths((prev) => {
              const next = new Set(prev);
              next.delete(node.path);
              return next;
            });
          }
        }

        setExpandedPaths((prev) => new Set(prev).add(node.path));
      }
    },
    [expandedPaths, loadDirectory]
  );

  // Handle file selection
  const handleSelectFile = useCallback(
    (path: string) => {
      onSelectFile(path);
    },
    [onSelectFile]
  );

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 p-4 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (error) {
    return <div className={cn('p-4 text-sm text-destructive', className)}>Error: {error}</div>;
  }

  if (tree.length === 0) {
    return <div className={cn('p-4 text-sm text-muted-foreground', className)}>Empty directory</div>;
  }

  return (
    <div className={cn('flex flex-1 flex-col overflow-auto', className)}>
      <div role="tree" aria-label="File explorer">
        {tree.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            level={0}
            selectedPath={selectedFile}
            expandedPaths={expandedPaths}
            loadingPaths={loadingPaths}
            onToggleExpand={handleToggleExpand}
            onSelect={handleSelectFile}
            onOpen={onOpenFile}
            fileChanges={fileChanges}
          />
        ))}
      </div>
    </div>
  );
};
