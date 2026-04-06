import fs from 'fs';

/**
 * Resolve the git binary path, checking common locations and env override.
 */
export function resolveGitBin(): string {
  const fromEnv = (process.env.GIT_PATH || '').trim();
  const candidates = [
    fromEnv,
    '/opt/homebrew/bin/git',
    '/usr/local/bin/git',
    '/usr/bin/git',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // skip inaccessible paths
    }
  }
  return 'git';
}
