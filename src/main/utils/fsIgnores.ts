export const DEFAULT_IGNORES = new Set([
  // Version control
  '.git',
  '.svn',
  '.hg',

  // Dependencies
  'node_modules',
  '.pnpm-store',
  'vendor',
  'bower_components',

  // Build outputs
  'dist',
  'build',
  'out',
  'release',
  'target',

  // Framework caches
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.turbo',

  // Test/coverage
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',

  // IDE/Editor
  '.idea',
  '.vscode-test',

  // OS files
  '.DS_Store',
  'Thumbs.db',

  // AI agent directories
  '.claude',
  '.cursor',
  '.amp',
  '.codex',
  '.aider',
  '.continue',
  '.cody',
  '.windsurf',
  '.conductor',

  // Misc
  'tmp',
  'temp',
  '.terraform',
  '.serverless',
  'worktrees',
  '.worktrees',
  '.checkouts',
  'checkouts',
]);
