/**
 * Tests for GitHub / remote Git service operations.
 *
 * NOTE: The codebase does not have a standalone GitHubService.ts.
 * GitHub integration lives in src/main/ipc/gitIpc.ts (via the `gh` CLI) and
 * src/main/services/RemoteGitService.ts for SSH-backed git operations.
 *
 * These tests cover RemoteGitService — which provides the git abstraction layer
 * for branch management, worktree creation, and status operations used when
 * running agents over SSH remote connections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- SSH service mock ----
const executeCommandMock = vi.fn();

const sshServiceMock = {
  executeCommand: executeCommandMock,
};

describe('RemoteGitService', () => {
  let RemoteGitService: typeof import('../../main/services/RemoteGitService').RemoteGitService;
  let service: InstanceType<typeof import('../../main/services/RemoteGitService').RemoteGitService>;

  beforeEach(async () => {
    vi.resetModules();
    executeCommandMock.mockReset();
    const mod = await import('../../main/services/RemoteGitService');
    RemoteGitService = mod.RemoteGitService;
    service = new RemoteGitService(sshServiceMock as any);
  });

  // -------------------------------------------------------------------------
  // getStatus()
  // -------------------------------------------------------------------------
  describe('getStatus()', () => {
    it('returns clean status when no files are modified', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: '## main...origin/main\n',
        stderr: '',
      });

      const status = await service.getStatus('conn-1', '/project/worktree');

      expect(status.branch).toBe('main');
      expect(status.isClean).toBe(true);
      expect(status.files).toEqual([]);
    });

    it('returns modified files list', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: '## feature...origin/feature\n M src/index.ts\n?? untracked.ts\n',
        stderr: '',
      });

      const status = await service.getStatus('conn-1', '/project');

      expect(status.branch).toBe('feature');
      expect(status.isClean).toBe(false);
      expect(status.files).toHaveLength(2);
      expect(status.files[0]).toMatchObject({ status: 'M', path: 'src/index.ts' });
    });

    it('throws when git status exits with non-zero code', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
      });

      await expect(service.getStatus('conn-1', '/bad-path')).rejects.toThrow(
        'Git status failed'
      );
    });

    it('handles branch with upstream divergence info', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: '## develop...origin/develop [ahead 2, behind 1]\n',
        stderr: '',
      });

      const status = await service.getStatus('conn-1', '/project');
      expect(status.branch).toBe('develop');
      expect(status.isClean).toBe(true);
    });

    it('uses "unknown" when branch line is malformed', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: 'malformed line\n',
        stderr: '',
      });

      const status = await service.getStatus('conn-1', '/project');
      expect(status.branch).toBe('unknown');
    });
  });

  // -------------------------------------------------------------------------
  // getDefaultBranch()
  // -------------------------------------------------------------------------
  describe('getDefaultBranch()', () => {
    it('returns the current branch name when HEAD is not detached', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: 'main\n',
        stderr: '',
      });

      const branch = await service.getDefaultBranch('conn-1', '/project');
      expect(branch).toBe('main');
    });

    it('falls back to checking common branches when HEAD is detached', async () => {
      executeCommandMock
        // rev-parse HEAD returns 'HEAD' (detached)
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'HEAD\n', stderr: '' })
        // Check 'main' — not found
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
        // Check 'master' — found
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'abc123\n', stderr: '' });

      const branch = await service.getDefaultBranch('conn-1', '/project');
      expect(branch).toBe('master');
    });

    it('falls back to checking "develop" when main/master not found', async () => {
      executeCommandMock
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'HEAD\n', stderr: '' })
        // main — not found
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
        // master — not found
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
        // develop — found
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'abc123\n', stderr: '' });

      const branch = await service.getDefaultBranch('conn-1', '/project');
      expect(branch).toBe('develop');
    });

    it('returns "HEAD" when all common branches fail', async () => {
      executeCommandMock
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'HEAD\n', stderr: '' })
        .mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });

      const branch = await service.getDefaultBranch('conn-1', '/project');
      expect(branch).toBe('HEAD');
    });

    it('returns current branch when rev-parse succeeds with non-HEAD value', async () => {
      executeCommandMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'feature/my-branch\n',
        stderr: '',
      });

      const branch = await service.getDefaultBranch('conn-1', '/project');
      expect(branch).toBe('feature/my-branch');
    });

    it('normalizes trailing whitespace from branch output', async () => {
      executeCommandMock.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '  main  \n',
        stderr: '',
      });

      const branch = await service.getDefaultBranch('conn-1', '/project');
      expect(branch).toBe('main');
    });
  });

  // -------------------------------------------------------------------------
  // createWorktree()
  // -------------------------------------------------------------------------
  describe('createWorktree()', () => {
    beforeEach(() => {
      // Default: mkdir succeeds, rev-parse verify succeeds, git worktree add succeeds
      executeCommandMock
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'abc123', stderr: '' }) // verify baseRef
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'Preparing worktree', stderr: '' }); // worktree add
    });

    it('creates a worktree and returns path, branch, and isMain=false', async () => {
      const result = await service.createWorktree('conn-1', '/project', 'my-task', 'main');

      expect(result.isMain).toBe(false);
      expect(result.branch).toBeTruthy();
      expect(result.path).toContain('/project');
    });

    it('includes task name slug in the branch name', async () => {
      const result = await service.createWorktree('conn-1', '/project', 'Fix Auth Bug', 'main');
      expect(result.branch).toContain('fix-auth-bug');
    });

    it('sanitizes special characters in task name for branch name', async () => {
      const result = await service.createWorktree(
        'conn-1',
        '/project',
        'feat: add user@auth!!',
        'main'
      );
      expect(result.branch).not.toMatch(/[@!:]/);
    });

    it('falls back to auto-detected branch when provided baseRef does not exist', async () => {
      executeCommandMock.mockReset();
      executeCommandMock
        // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
        // verify baseRef — fails (branch does not exist)
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' })
        // auto-detect: rev-parse HEAD returns branch name
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'develop\n', stderr: '' })
        // worktree add
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });

      const result = await service.createWorktree('conn-1', '/project', 'task', 'nonexistent');
      expect(result.path).toBeTruthy();
    });

    it('throws when git worktree add fails', async () => {
      executeCommandMock.mockReset();
      executeCommandMock
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' }) // mkdir
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'abc123', stderr: '' }) // verify
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'fatal: branch already checked out',
        }); // worktree add

      await expect(
        service.createWorktree('conn-1', '/project', 'task', 'main')
      ).rejects.toThrow('Failed to create worktree');
    });

    it('uses "task" as branch slug fallback when name is empty', async () => {
      const result = await service.createWorktree('conn-1', '/project', '', 'main');
      expect(result.branch).toContain('task');
    });
  });

  // -------------------------------------------------------------------------
  // removeWorktree()
  // -------------------------------------------------------------------------
  describe('removeWorktree()', () => {
    it('removes a worktree successfully', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await expect(
        service.removeWorktree('conn-1', '/project', '/project/.valkyr/worktrees/my-task')
      ).resolves.toBeUndefined();
    });

    it('throws when git worktree remove fails', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'fatal: worktree not found',
      });

      await expect(
        service.removeWorktree('conn-1', '/project', '/project/.valkyr/worktrees/bad')
      ).rejects.toThrow('Failed to remove worktree');
    });
  });

  // -------------------------------------------------------------------------
  // listWorktrees()
  // -------------------------------------------------------------------------
  describe('listWorktrees()', () => {
    it('parses porcelain output into WorktreeInfo array', async () => {
      const porcelain = [
        'worktree /project',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /project/.valkyr/worktrees/feat-123',
        'HEAD def456',
        'branch refs/heads/feat-123',
        '',
      ].join('\n');

      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: porcelain, stderr: '' });

      const worktrees = await service.listWorktrees('conn-1', '/project');

      expect(worktrees).toHaveLength(2);
      expect(worktrees[0]).toMatchObject({ branch: 'main', isMain: true });
      expect(worktrees[1]).toMatchObject({ branch: 'feat-123', isMain: false });
    });

    it('returns empty array when no worktrees exist (blank output)', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const worktrees = await service.listWorktrees('conn-1', '/project');
      expect(worktrees).toEqual([]);
    });

    it('throws when git worktree list fails', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 128,
        stdout: '',
        stderr: 'fatal: not a git repo',
      });

      await expect(service.listWorktrees('conn-1', '/project')).rejects.toThrow(
        'Failed to list worktrees'
      );
    });

    it('uses "HEAD" as branch when no branch line is present', async () => {
      const porcelain = ['worktree /project/.valkyr/worktrees/detached', 'HEAD abc123', ''].join(
        '\n'
      );
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: porcelain, stderr: '' });

      const worktrees = await service.listWorktrees('conn-1', '/project');
      expect(worktrees[0].branch).toBe('HEAD');
    });
  });

  // -------------------------------------------------------------------------
  // getWorktreeStatus()
  // -------------------------------------------------------------------------
  describe('getWorktreeStatus()', () => {
    it('categorises staged, unstaged, and untracked files', async () => {
      const porcelain = [
        'A  staged-new.ts',
        ' M unstaged-modified.ts',
        'M  staged-modified.ts',
        '?? untracked.ts',
      ].join('\n');

      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: porcelain, stderr: '' });

      const status = await service.getWorktreeStatus('conn-1', '/project/worktree');

      expect(status.hasChanges).toBe(true);
      expect(status.stagedFiles).toContain('staged-new.ts');
      expect(status.unstagedFiles).toContain('unstaged-modified.ts');
      expect(status.untrackedFiles).toContain('untracked.ts');
    });

    it('returns hasChanges=false when working tree is clean', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const status = await service.getWorktreeStatus('conn-1', '/project/worktree');
      expect(status.hasChanges).toBe(false);
      expect(status.stagedFiles).toHaveLength(0);
      expect(status.unstagedFiles).toHaveLength(0);
      expect(status.untrackedFiles).toHaveLength(0);
    });

    it('throws when git status exits with non-zero code', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 128,
        stdout: '',
        stderr: 'fatal: not a git repository',
      });

      await expect(service.getWorktreeStatus('conn-1', '/bad')).rejects.toThrow(
        'Git status failed'
      );
    });
  });

  // -------------------------------------------------------------------------
  // getBranchList()
  // -------------------------------------------------------------------------
  describe('getBranchList()', () => {
    it('returns list of branches', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: 'main\ndevelop\nfeature/auth\n',
        stderr: '',
      });

      const branches = await service.getBranchList('conn-1', '/project');
      expect(branches).toContain('main');
      expect(branches).toContain('develop');
      expect(branches).toContain('feature/auth');
    });

    it('returns empty array when command fails', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });

      const branches = await service.getBranchList('conn-1', '/project');
      expect(branches).toEqual([]);
    });

    it('filters out empty lines from output', async () => {
      executeCommandMock.mockResolvedValue({
        exitCode: 0,
        stdout: 'main\n\n\ndevelop\n\n',
        stderr: '',
      });

      const branches = await service.getBranchList('conn-1', '/project');
      expect(branches.every((b) => b.trim().length > 0)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // commit()
  // -------------------------------------------------------------------------
  describe('commit()', () => {
    it('commits with message only when no files specified', async () => {
      const expected = { exitCode: 0, stdout: '[main abc123] My commit', stderr: '' };
      executeCommandMock.mockResolvedValue(expected);

      const result = await service.commit('conn-1', '/project/worktree', 'My commit');
      expect(result).toEqual(expected);
    });

    it('stages specific files before committing when files array provided', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      await service.commit('conn-1', '/project/worktree', 'Add feature', [
        'src/a.ts',
        'src/b.ts',
      ]);

      const [, cmd] = executeCommandMock.mock.calls[0];
      expect(cmd).toContain('git add');
      expect(cmd).toContain('src/a.ts');
      expect(cmd).toContain('git commit');
    });

    it('passes the commit message correctly', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      await service.commit('conn-1', '/worktree', 'feat: add auth', []);
      const [, cmd] = executeCommandMock.mock.calls[0];
      expect(cmd).toContain('feat: add auth');
    });
  });

  // -------------------------------------------------------------------------
  // Path normalisation
  // -------------------------------------------------------------------------
  describe('path normalisation', () => {
    it('normalises trailing slashes on project path when listing worktrees', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      // Should not throw even with trailing slash
      await service.listWorktrees('conn-1', '/project/');
      const [, , cwd] = executeCommandMock.mock.calls[0];
      expect(cwd).not.toMatch(/\/$/);
    });

    it('normalises Windows-style backslashes in paths', async () => {
      executeCommandMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      await service.removeWorktree(
        'conn-1',
        'C:\\project',
        'C:\\project\\.valkyr\\worktrees\\task'
      );

      const [, cmd] = executeCommandMock.mock.calls[0];
      expect(cmd).not.toContain('\\');
    });
  });
});
