import * as fs from 'fs';
import * as path from 'path';
import { safeStat } from '../../utils/safeStat';
import { ALLOWED_IMAGE_EXTENSIONS, DEFAULT_ATTACHMENTS_SUBDIR, imageMimeType } from './fsConstants';

// ---------------------------------------------------------------------------
// Path safety helper (DRY: replaces duplicated resolve+startsWith in callers)
// ---------------------------------------------------------------------------

/**
 * Resolve `relPath` relative to `root` and verify the result does not escape
 * `root`. Returns the absolute path on success, or `null` if the path would
 * escape the root directory.
 */
export function resolveSafePath(root: string, relPath: string): string | null {
  const abs = path.resolve(root, relPath);
  const normRoot = path.resolve(root) + path.sep;
  return abs.startsWith(normRoot) ? abs : null;
}

// ---------------------------------------------------------------------------
// Read result types
// ---------------------------------------------------------------------------

export interface ReadFileResult {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
}

export interface ReadImageResult {
  dataUrl: string;
  mimeType: string;
  size: number;
}

export interface SaveAttachmentResult {
  absPath: string;
  relPath: string;
  fileName: string;
}

// ---------------------------------------------------------------------------
// FsService — pure filesystem operations, no IPC wrapping
// ---------------------------------------------------------------------------

export class FsService {
  /**
   * Read a directory's immediate children. Returns entries sorted with
   * directories first, then alphabetically by name.
   */
  readDirectory(dirPath: string): Array<{ name: string; type: 'file' | 'dir' }> {
    const stat = safeStat(dirPath);
    if (!stat || !stat.isDirectory()) {
      throw new Error('Not a directory');
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? ('dir' as const) : ('file' as const),
    }));

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  /**
   * Read a text file relative to `root`, limited to `maxBytes`.
   * Throws on path escape, missing file, or I/O error.
   */
  readFile(root: string, relPath: string, maxBytes: number): ReadFileResult {
    const abs = resolveSafePath(root, relPath);
    if (!abs) throw new Error('Path escapes root');

    const st = safeStat(abs);
    if (!st) throw new Error('Not found');
    if (st.isDirectory()) throw new Error('Is a directory');

    const size = st.size;
    let truncated = false;
    let content: string;

    const fd = fs.openSync(abs, 'r');
    try {
      const bytesToRead = Math.min(size, maxBytes);
      const buf = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buf, 0, bytesToRead, 0);
      content = buf.toString('utf8');
      truncated = size > bytesToRead;
    } finally {
      fs.closeSync(fd);
    }

    return { path: relPath, size, truncated, content };
  }

  /**
   * Read an image file relative to `root` and return it as a base64 data URL.
   * Throws on path escape, unsupported type, or I/O error.
   */
  readImage(root: string, relPath: string): ReadImageResult {
    const abs = resolveSafePath(root, relPath);
    if (!abs) throw new Error('Path escapes root');

    const st = safeStat(abs);
    if (!st) throw new Error('Not found');
    if (st.isDirectory()) throw new Error('Is a directory');

    const ext = path.extname(relPath).toLowerCase();
    const mimeType = imageMimeType(ext);
    if (!mimeType) throw new Error('Not an image file');

    const buffer = fs.readFileSync(abs);
    const base64 = buffer.toString('base64');

    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
      size: st.size,
    };
  }

  /**
   * Write `content` to `relPath` relative to `root`.
   * Creates parent directories when `mkdirs` is true (default).
   * Returns the resolved absolute path.
   * Throws on path escape or I/O error (including EACCES).
   */
  writeFile(root: string, relPath: string, content: string, mkdirs = true): string {
    const abs = resolveSafePath(root, relPath);
    if (!abs) throw new Error('Path escapes root');

    if (mkdirs) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
    }

    fs.writeFileSync(abs, content, 'utf8');
    return abs;
  }

  /**
   * Remove a file at `relPath` relative to `root`.
   * Silently succeeds if the file does not exist.
   * Attempts a chmod retry on EACCES before re-throwing.
   * Throws on path escape, directory targets, or unrecoverable I/O errors.
   */
  removeFile(root: string, relPath: string): void {
    const abs = resolveSafePath(root, relPath);
    if (!abs) throw new Error('Path escapes root');

    if (!fs.existsSync(abs)) return;

    const st = safeStat(abs);
    if (st && st.isDirectory()) throw new Error('Is a directory');

    try {
      fs.unlinkSync(abs);
    } catch (e: any) {
      // Attempt to relax permissions and retry (useful after a plan lock)
      try {
        const dir = path.dirname(abs);
        const dst = safeStat(dir);
        if (dst) fs.chmodSync(dir, (dst.mode & 0o7777) | 0o222);
      } catch {}
      try {
        const fst = safeStat(abs);
        if (fst) fs.chmodSync(abs, (fst.mode & 0o7777) | 0o222);
      } catch {}
      fs.unlinkSync(abs); // let this throw if it still fails
    }
  }

  /**
   * Copy an attachment file from `srcPath` into `<taskPath>/.valkyr/<subdir>/`.
   * Only ALLOWED_IMAGE_EXTENSIONS are accepted.
   * Returns metadata about the saved file.
   * Throws on invalid paths, unsupported type, or I/O error.
   */
  saveAttachment(taskPath: string, srcPath: string, subdir?: string): SaveAttachmentResult {
    const ext = path.extname(srcPath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new Error('Unsupported attachment type');
    }

    const baseDir = path.join(taskPath, '.valkyr', subdir ?? DEFAULT_ATTACHMENTS_SUBDIR);
    fs.mkdirSync(baseDir, { recursive: true });

    const baseName = path.basename(srcPath);
    let destName = baseName;
    let counter = 1;
    let destAbs = path.join(baseDir, destName);

    while (fs.existsSync(destAbs)) {
      const name = path.basename(baseName, ext);
      destName = `${name}-${counter}${ext}`;
      destAbs = path.join(baseDir, destName);
      counter++;
    }

    fs.copyFileSync(srcPath, destAbs);

    return {
      absPath: destAbs,
      relPath: path.relative(taskPath, destAbs),
      fileName: destName,
    };
  }
}

export const fsService = new FsService();
