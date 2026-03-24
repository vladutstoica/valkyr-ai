import { DEFAULT_IGNORES } from '../../utils/fsIgnores';

// ---------------------------------------------------------------------------
// Attachment constants
// ---------------------------------------------------------------------------

export const ALLOWED_IMAGE_EXTENSIONS = new Set<string>([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
]);

export const DEFAULT_ATTACHMENTS_SUBDIR = 'attachments' as const;

/**
 * Derive the MIME type string for a supported image extension.
 * Returns null if the extension is not in ALLOWED_IMAGE_EXTENSIONS.
 */
export function imageMimeType(ext: string): string | null {
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) return null;
  switch (ext) {
    case '.svg':
      return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return `image/${ext.substring(1)}`;
  }
}

// ---------------------------------------------------------------------------
// fs:list worker constants
// ---------------------------------------------------------------------------

export const DEFAULT_TIME_BUDGET_MS = 2000;
export const MIN_TIME_BUDGET_MS = 250;
export const MAX_TIME_BUDGET_MS = 10000;
export const MAX_FILES_TO_SEARCH = 10000;
export const DEFAULT_BATCH_SIZE = 250;

// ---------------------------------------------------------------------------
// Search constants
// ---------------------------------------------------------------------------

export const SEARCH_PREVIEW_CONTEXT_LENGTH = 30;
export const DEFAULT_MAX_SEARCH_RESULTS = 100;
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
export const MAX_SEARCH_FILES = 5000;
export const BINARY_CHECK_BYTES = 512;

/**
 * Binary file extensions — skip these during content search.
 * NOTE: ALLOWED_IMAGE_EXTENSIONS is a subset; merged here so there is one
 * canonical list for "do not search" rather than two overlapping sets.
 */
export const BINARY_EXTENSIONS = new Set([
  // Images (superset of ALLOWED_IMAGE_EXTENSIONS + additional binary images)
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.svg',
  // Documents
  '.pdf',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  // Executables / native
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.a',
  '.o',
  // Media
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wav',
  '.flac',
  // Fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  // Compiled artefacts
  '.pyc',
  '.pyo',
  '.class',
  '.jar',
  '.war',
  '.node',
  '.wasm',
  // Misc
  '.map',
  '.DS_Store',
  '.lock',
]);

/** Extended ignore patterns for content search (superset of DEFAULT_IGNORES). */
export const SEARCH_IGNORES = new Set([
  ...DEFAULT_IGNORES,
  '.vscode',
  '.idea',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'target',
  '.terraform',
  '.serverless',
  'vendor',
  'bower_components',
  '.turbo',
  'worktrees',
  '.worktrees',
]);
