/**
 * File system service — thin abstraction over window.electronAPI fs calls.
 * Centralizes file operations so components don't scatter direct IPC calls.
 */

export type FsReadResult = Awaited<ReturnType<typeof window.electronAPI.fsRead>>;
export type FsWriteResult = Awaited<ReturnType<typeof window.electronAPI.fsWriteFile>>;
export type FsSearchResult = Awaited<ReturnType<typeof window.electronAPI.fsSearchContent>>;

/** Read a file relative to a root path. */
export function fsRead(
  root: string,
  relPath: string,
  maxBytes?: number
): Promise<FsReadResult> {
  return window.electronAPI.fsRead(root, relPath, maxBytes);
}

/** Write content to a file relative to a root path. */
export function fsWriteFile(
  root: string,
  relPath: string,
  content: string,
  mkdirs?: boolean
): Promise<FsWriteResult> {
  return window.electronAPI.fsWriteFile(root, relPath, content, mkdirs);
}

/** Search file contents within a root directory. */
export function fsSearchContent(
  root: string,
  query: string,
  options?: {
    caseSensitive?: boolean;
    maxResults?: number;
    fileExtensions?: string[];
  }
): Promise<FsSearchResult> {
  return window.electronAPI.fsSearchContent(root, query, options);
}

/** Check which paths are gitignored within a root directory. */
export function fsCheckIgnored(
  rootPath: string,
  paths: string[]
): Promise<{ success: boolean; ignoredPaths?: string[]; error?: string }> {
  return window.electronAPI.fsCheckIgnored(rootPath, paths);
}

/** Read directory contents. */
export function fsReaddir(dirPath: string): Promise<{
  success: boolean;
  items?: Array<{ name: string; type: 'file' | 'dir' }>;
  error?: string;
}> {
  return window.electronAPI.fsReaddir(dirPath);
}

/** Read an image file as a data URL. */
export function fsReadImage(
  root: string,
  relPath: string
): Promise<{
  success: boolean;
  dataUrl?: string;
  mimeType?: string;
  size?: number;
  error?: string;
}> {
  return window.electronAPI.fsReadImage(root, relPath);
}

/** Remove a file relative to a root path. */
export function fsRemove(
  root: string,
  relPath: string
): Promise<{ success: boolean; error?: string }> {
  return window.electronAPI.fsRemove(root, relPath);
}
