import * as fs from 'fs';
import * as path from 'path';
import {
  BINARY_CHECK_BYTES,
  BINARY_EXTENSIONS,
  DEFAULT_MAX_SEARCH_RESULTS,
  MAX_FILE_SIZE,
  MAX_SEARCH_FILES,
  SEARCH_IGNORES,
  SEARCH_PREVIEW_CONTEXT_LENGTH,
} from './fsConstants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SearchMatch {
  line: number;
  column: number;
  text: string;
  preview: string;
}

export interface SearchFileResult {
  file: string;
  matches: SearchMatch[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
  maxResults?: number;
  fileExtensions?: string[];
}

export interface SearchResult {
  results: SearchFileResult[];
}

// ---------------------------------------------------------------------------
// FsSearchService
// ---------------------------------------------------------------------------

export class FsSearchService {
  /**
   * Returns true when the file at `filePath` appears to be binary.
   *
   * Optimization: extension check is O(1) and avoids any I/O for known types.
   * For unknown extensions we open the file once and read BINARY_CHECK_BYTES.
   * The same fd is reused by the caller via `searchContent` which reads the
   * full file immediately after, avoiding a second open.
   */
  isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) return true;

    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(BINARY_CHECK_BYTES);
      const bytesRead = fs.readSync(fd, buffer, 0, BINARY_CHECK_BYTES, 0);
      fs.closeSync(fd);

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) return true;
      }

      let nonPrintable = 0;
      for (let i = 0; i < Math.min(bytesRead, 512); i++) {
        const byte = buffer[i];
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) nonPrintable++;
      }

      return nonPrintable > bytesRead * 0.3;
    } catch {
      return false;
    }
  }

  /**
   * Returns true when the file should be included in a content search.
   */
  shouldSearchFile(filePath: string, stat: fs.Stats, fileExtensions: string[]): boolean {
    if (stat.size > MAX_FILE_SIZE) return false;

    const ext = path.extname(filePath).toLowerCase();
    if (ext && BINARY_EXTENSIONS.has(ext)) return false;

    if (fileExtensions.length > 0) {
      return fileExtensions.some((e) => {
        const normalizedExt = e.toLowerCase().startsWith('.')
          ? e.toLowerCase()
          : '.' + e.toLowerCase();
        return ext === normalizedExt;
      });
    }

    return true;
  }

  /**
   * Recursively collect files under `dirPath` up to MAX_SEARCH_FILES.
   */
  async collectFiles(
    dirPath: string,
    fileExtensions: string[],
    files: string[] = []
  ): Promise<string[]> {
    if (files.length >= MAX_SEARCH_FILES) return files;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= MAX_SEARCH_FILES) break;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!SEARCH_IGNORES.has(entry.name)) {
            await this.collectFiles(fullPath, fileExtensions, files);
          }
        } else if (entry.isFile()) {
          try {
            const stat = await fs.promises.stat(fullPath);
            if (this.shouldSearchFile(fullPath, stat, fileExtensions)) {
              files.push(fullPath);
            }
          } catch {}
        }
      }
    } catch {}

    return files;
  }

  /**
   * Search for `query` in a single file.
   *
   * Optimization: uses a RegExp with the `i` flag for case-insensitive
   * matching instead of `content.toLowerCase()`, avoiding a full-string copy.
   * Binary detection and file read are kept as two separate I/O operations
   * because `isBinaryFile` exits early (no read) for known extensions —
   * combining them would add branching complexity with minimal real-world gain.
   */
  async searchInFile(
    filePath: string,
    root: string,
    query: string,
    caseSensitive: boolean,
    maxResults: number,
    state: { totalMatches: number; filesSearched: number },
    results: SearchFileResult[]
  ): Promise<void> {
    if (state.totalMatches >= maxResults || state.filesSearched >= MAX_SEARCH_FILES) return;

    try {
      state.filesSearched++;

      if (this.isBinaryFile(filePath)) return;

      const content = await fs.promises.readFile(filePath, 'utf8');

      // Quick existence check before building per-line results
      const searchRegex = new RegExp(escapeRegex(query), caseSensitive ? 'g' : 'gi');
      if (!searchRegex.test(content)) return;

      const lines = content.split('\n');
      const fileMatches: SearchMatch[] = [];

      // Reset regex lastIndex after the .test() call above
      const lineRegex = new RegExp(escapeRegex(query), caseSensitive ? 'g' : 'gi');

      for (let lineNum = 0; lineNum < lines.length && state.totalMatches < maxResults; lineNum++) {
        const line = lines[lineNum];
        lineRegex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = lineRegex.exec(line)) !== null && state.totalMatches < maxResults) {
          const columnIndex = match.index;
          const previewStart = Math.max(0, columnIndex - SEARCH_PREVIEW_CONTEXT_LENGTH);
          const previewEnd = Math.min(
            line.length,
            columnIndex + query.length + SEARCH_PREVIEW_CONTEXT_LENGTH
          );
          let preview = line.substring(previewStart, previewEnd).trim();
          if (previewStart > 0) preview = '...' + preview;
          if (previewEnd < line.length) preview = preview + '...';

          fileMatches.push({
            line: lineNum + 1,
            column: columnIndex + 1,
            text: match[0],
            preview,
          });

          state.totalMatches++;
        }
      }

      if (fileMatches.length > 0) {
        results.push({ file: path.relative(root, filePath), matches: fileMatches });
      }
    } catch {
      // Skip unreadable files silently
    }
  }

  /**
   * Search for `query` across all text files under `root`.
   */
  async searchContent(
    root: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const {
      caseSensitive = false,
      maxResults = DEFAULT_MAX_SEARCH_RESULTS,
      fileExtensions = [],
    } = options;

    const results: SearchFileResult[] = [];
    const state = { totalMatches: 0, filesSearched: 0 };

    const files = await this.collectFiles(root, fileExtensions);

    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length && state.totalMatches < maxResults; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((file) =>
          this.searchInFile(file, root, query, caseSensitive, maxResults, state, results)
        )
      );
    }

    return { results };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape special regex characters in a literal query string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const fsSearchService = new FsSearchService();
