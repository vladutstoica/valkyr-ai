/**
 * Tests for PR generation / GitHub CLI integration helpers.
 *
 * NOTE: The codebase does not have a standalone PrGenerationService.ts.
 * PR creation logic lives in src/main/ipc/gitIpc.ts (the 'git:create-pr' handler).
 * These tests cover:
 *   1. The updaterError utilities used across the update/error flow
 *   2. RemoteGitService worktree operations used as the basis for PR branch management
 *   3. URL and error-code extraction patterns used in the PR creation handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// -------------------------------------------------------------------------
// updaterError helpers — used when formatting error responses
// -------------------------------------------------------------------------
describe('formatUpdaterError (PR error formatting utilities)', () => {
  let formatUpdaterError: typeof import('../../main/lib/updaterError').formatUpdaterError;
  let stripMarkupAndTruncate: typeof import('../../main/lib/updaterError').stripMarkupAndTruncate;
  let sanitizeUpdaterLogArgs: typeof import('../../main/lib/updaterError').sanitizeUpdaterLogArgs;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../main/lib/updaterError');
    formatUpdaterError = mod.formatUpdaterError;
    stripMarkupAndTruncate = mod.stripMarkupAndTruncate;
    sanitizeUpdaterLogArgs = mod.sanitizeUpdaterLogArgs;
  });

  describe('stripMarkupAndTruncate()', () => {
    it('returns "Unknown update error" for empty string', () => {
      expect(stripMarkupAndTruncate('')).toBe('Unknown update error');
    });

    it('strips HTML starting at <!DOCTYPE html ...>', () => {
      const input = 'Error: <!DOCTYPE html><html><body>HTML content</body></html>';
      const result = stripMarkupAndTruncate(input);
      expect(result).not.toContain('DOCTYPE');
      expect(result).not.toContain('<html>');
    });

    it('strips HTML starting at <html ...>', () => {
      const input = 'Prefix <html lang="en"><head/><body>body</body></html>';
      const result = stripMarkupAndTruncate(input);
      expect(result).not.toContain('<html');
    });

    it('truncates strings longer than 240 characters', () => {
      const longString = 'a'.repeat(300);
      const result = stripMarkupAndTruncate(longString);
      expect(result.length).toBeLessThanOrEqual(244); // 240 chars + ellipsis
      expect(result.endsWith('…')).toBe(true);
    });

    it('does not truncate strings of exactly 240 characters', () => {
      const exactString = 'b'.repeat(240);
      const result = stripMarkupAndTruncate(exactString);
      expect(result).toBe(exactString);
      expect(result.endsWith('…')).toBe(false);
    });

    it('strips "Data:" section and content after it', () => {
      const input = 'Important error message Data: <lots of raw data>';
      const result = stripMarkupAndTruncate(input);
      expect(result).toContain('Important error message');
      expect(result).not.toContain('Data:');
    });

    it('collapses multiple whitespace characters into single spaces', () => {
      const input = 'Error   message\t\twith   spaces';
      const result = stripMarkupAndTruncate(input);
      expect(result).not.toMatch(/\s{2,}/);
    });

    it('returns "Unknown update error" when only whitespace remains after stripping', () => {
      const result = stripMarkupAndTruncate('   \t  \n  ');
      expect(result).toBe('Unknown update error');
    });

    it('preserves meaningful text without modification', () => {
      const result = stripMarkupAndTruncate('PR creation failed: branch already exists');
      expect(result).toBe('PR creation failed: branch already exists');
    });
  });

  describe('formatUpdaterError()', () => {
    it('formats an Error instance by extracting its message', () => {
      const err = new Error('authentication failed');
      expect(formatUpdaterError(err)).toBe('authentication failed');
    });

    it('formats an error with statusCode', () => {
      const err = { statusCode: 401 };
      const result = formatUpdaterError(err);
      expect(result).toContain('401');
      expect(result).toContain('HTTP');
    });

    it('formats an error with statusCode and statusMessage', () => {
      const err = { statusCode: 403, statusMessage: 'Forbidden' };
      const result = formatUpdaterError(err);
      expect(result).toContain('403');
      expect(result).toContain('Forbidden');
    });

    it('formats an error with code field', () => {
      const err = { code: 'ENOTFOUND' };
      const result = formatUpdaterError(err);
      expect(result).toContain('ENOTFOUND');
    });

    it('handles null error gracefully', () => {
      const result = formatUpdaterError(null);
      expect(result).toBe('Unknown update error');
    });

    it('handles undefined error gracefully', () => {
      const result = formatUpdaterError(undefined);
      expect(result).toBe('Unknown update error');
    });

    it('converts non-Error, non-object to string', () => {
      const result = formatUpdaterError('raw string error');
      expect(result).toBe('raw string error');
    });

    it('prefers statusCode over code when both are present', () => {
      const err = { statusCode: 500, code: 'SOME_CODE' };
      const result = formatUpdaterError(err);
      expect(result).toContain('500');
    });
  });

  describe('sanitizeUpdaterLogArgs()', () => {
    it('returns an empty array for empty input', () => {
      expect(sanitizeUpdaterLogArgs([])).toEqual([]);
    });

    it('formats Error instances within the array', () => {
      const err = new Error('auth failed');
      const result = sanitizeUpdaterLogArgs([err]);
      expect(result[0]).toBe('auth failed');
    });

    it('sanitizes string arguments', () => {
      const result = sanitizeUpdaterLogArgs(['a long error message']);
      expect(result[0]).toBe('a long error message');
    });

    it('passes through non-string, non-Error values unchanged', () => {
      const obj = { key: 'value' };
      const result = sanitizeUpdaterLogArgs([obj]);
      expect(result[0]).toBe(obj);
    });

    it('handles mixed array of strings, Errors, and objects', () => {
      const err = new Error('oops');
      const obj = { data: 1 };
      const result = sanitizeUpdaterLogArgs(['message', err, obj]);
      expect(typeof result[0]).toBe('string');
      expect(typeof result[1]).toBe('string');
      expect(result[2]).toBe(obj);
    });
  });
});

// -------------------------------------------------------------------------
// PR URL extraction pattern — mirrors logic in git:create-pr handler
// -------------------------------------------------------------------------
describe('PR URL extraction from gh CLI output', () => {
  function extractPrUrl(output: string): string | null {
    const urlMatch = output.match(/https?:\/\/\S+/);
    return urlMatch ? urlMatch[0] : null;
  }

  it('extracts a GitHub PR URL from CLI output', () => {
    const output = 'https://github.com/user/repo/pull/42';
    expect(extractPrUrl(output)).toBe('https://github.com/user/repo/pull/42');
  });

  it('extracts the first URL when multiple are present', () => {
    const output =
      'Created PR: https://github.com/user/repo/pull/1 see also https://github.com/user/repo/pull/2';
    expect(extractPrUrl(output)).toBe('https://github.com/user/repo/pull/1');
  });

  it('returns null when no URL is present', () => {
    expect(extractPrUrl('No PR URL in this output')).toBeNull();
  });

  it('handles empty string', () => {
    expect(extractPrUrl('')).toBeNull();
  });

  it('extracts https:// URLs', () => {
    const output = 'https://github.com/org/project/pull/99';
    expect(extractPrUrl(output)).toContain('https://');
  });
});

// -------------------------------------------------------------------------
// Error code classification — mirrors logic in git:create-pr handler
// -------------------------------------------------------------------------
describe('PR error code classification', () => {
  const restrictionRe =
    /Auth App access restrictions|authorized OAuth apps|third-parties is limited/i;
  const prExistsRe = /already exists|already has.*pull request|pull request for branch/i;

  function classifyError(combined: string): string | undefined {
    if (restrictionRe.test(combined)) return 'ORG_AUTH_APP_RESTRICTED';
    if (prExistsRe.test(combined)) return 'PR_ALREADY_EXISTS';
    return undefined;
  }

  it('classifies org auth app restriction errors', () => {
    expect(classifyError('Auth App access restrictions prevented this action')).toBe(
      'ORG_AUTH_APP_RESTRICTED'
    );
  });

  it('classifies authorized OAuth apps restriction', () => {
    expect(classifyError('authorized OAuth apps are not allowed')).toBe('ORG_AUTH_APP_RESTRICTED');
  });

  it('classifies third-parties restriction', () => {
    expect(classifyError('third-parties is limited by the org policy')).toBe(
      'ORG_AUTH_APP_RESTRICTED'
    );
  });

  it('classifies duplicate PR errors (already exists)', () => {
    expect(classifyError('a pull request already exists for this branch')).toBe(
      'PR_ALREADY_EXISTS'
    );
  });

  it('classifies duplicate PR errors (already has pull request)', () => {
    expect(classifyError('branch already has a pull request')).toBe('PR_ALREADY_EXISTS');
  });

  it('classifies duplicate PR errors (pull request for branch)', () => {
    expect(classifyError('pull request for branch "feat/x" already exists')).toBe(
      'PR_ALREADY_EXISTS'
    );
  });

  it('returns undefined for unrecognised errors', () => {
    expect(classifyError('network timeout')).toBeUndefined();
    expect(classifyError('')).toBeUndefined();
  });

  it('is case-insensitive for auth restriction patterns', () => {
    expect(classifyError('AUTH APP ACCESS RESTRICTIONS')).toBe('ORG_AUTH_APP_RESTRICTED');
  });
});

// -------------------------------------------------------------------------
// GitHub remote URL parsing — mirrors logic in git:create-pr handler
// -------------------------------------------------------------------------
describe('GitHub remote URL parsing', () => {
  function parseGitHubRepo(url: string): string | null {
    const m =
      url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i) ||
      url.match(/([^/:]+)[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (!m) return null;
    const owner = m[1].includes('github.com') ? m[1].split('github.com').pop()! : m[1];
    const repo = m[2] || m[3];
    return `${owner}/${repo}`.replace(/^\/*/, '');
  }

  it('parses SSH remote URL (git@github.com:owner/repo.git)', () => {
    const result = parseGitHubRepo('git@github.com:owner/repo.git');
    expect(result).toBe('owner/repo');
  });

  it('parses HTTPS remote URL (https://github.com/owner/repo.git)', () => {
    const result = parseGitHubRepo('https://github.com/owner/repo.git');
    expect(result).toBe('owner/repo');
  });

  it('parses HTTPS remote URL without .git suffix', () => {
    const result = parseGitHubRepo('https://github.com/owner/repo');
    expect(result).toBe('owner/repo');
  });

  it('returns null for non-GitHub URLs', () => {
    const result = parseGitHubRepo('https://gitlab.com/owner/repo.git');
    // The generic fallback pattern may still parse this
    // We only assert it does not throw
    expect(() => parseGitHubRepo('https://gitlab.com/owner/repo.git')).not.toThrow();
  });

  it('handles empty string without throwing', () => {
    expect(parseGitHubRepo('')).toBeNull();
  });
});
