import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock state — captured ipcMain.handle registrations
// ---------------------------------------------------------------------------

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const dbMock = {
  saveLineComment: vi.fn(),
  getLineComments: vi.fn(),
  updateLineComment: vi.fn(),
  deleteLineComment: vi.fn(),
  markCommentsSent: vi.fn(),
  getUnsentComments: vi.fn(),
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
      ipcHandlers.set(channel, cb);
    }),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: dbMock,
}));

// formatCommentsForAgent is a pure function — use the real implementation
// to ensure the formatted output contract is validated end-to-end.

// ---------------------------------------------------------------------------
// Helper: invoke a registered IPC handler as if called from renderer
// ---------------------------------------------------------------------------

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No IPC handler registered for channel: ${channel}`);
  // First arg is the ipcMain event object (unused by these handlers)
  return handler({}, ...args);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

  // Re-apply mocks after resetModules so the import below picks them up
  vi.mock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));
  vi.mock('../../main/lib/logger', () => ({
    log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.mock('../../main/services/DatabaseService', () => ({
    databaseService: dbMock,
  }));

  const { registerLineCommentsIpc } = await import('../../main/ipc/lineCommentsIpc');
  registerLineCommentsIpc();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lineCommentsIpc', () => {
  describe('lineComments:create', () => {
    it('returns success with generated id when comment is saved', async () => {
      dbMock.saveLineComment.mockResolvedValue('comment-uuid-001');

      const input = { taskId: 'task-1', filePath: 'src/foo.ts', lineNumber: 42, content: 'Fix this' };
      const result = await callHandler('lineComments:create', input);

      expect(result).toEqual({ success: true, id: 'comment-uuid-001' });
      expect(dbMock.saveLineComment).toHaveBeenCalledWith(input);
    });

    it('returns failure with error message when db throws', async () => {
      dbMock.saveLineComment.mockRejectedValue(new Error('constraint violation'));

      const result = await callHandler('lineComments:create', {});

      expect(result).toEqual({ success: false, error: 'constraint violation' });
    });

    it('passes through the full input object to databaseService', async () => {
      dbMock.saveLineComment.mockResolvedValue('id-xyz');
      const input = { taskId: 't2', filePath: 'lib/bar.ts', lineNumber: 10, content: 'Note' };

      await callHandler('lineComments:create', input);

      expect(dbMock.saveLineComment).toHaveBeenCalledWith(input);
    });
  });

  describe('lineComments:get', () => {
    it('returns comments for a given taskId', async () => {
      const comments = [
        { id: 'c1', taskId: 'task-1', filePath: 'src/foo.ts', lineNumber: 5, content: 'Hi' },
      ];
      dbMock.getLineComments.mockResolvedValue(comments);

      const result = await callHandler('lineComments:get', { taskId: 'task-1' });

      expect(result).toEqual({ success: true, comments });
      expect(dbMock.getLineComments).toHaveBeenCalledWith('task-1', undefined);
    });

    it('filters by filePath when provided', async () => {
      const comments = [
        { id: 'c2', taskId: 'task-1', filePath: 'src/bar.ts', lineNumber: 1, content: 'Bar' },
      ];
      dbMock.getLineComments.mockResolvedValue(comments);

      const result = await callHandler('lineComments:get', {
        taskId: 'task-1',
        filePath: 'src/bar.ts',
      });

      expect(result).toEqual({ success: true, comments });
      expect(dbMock.getLineComments).toHaveBeenCalledWith('task-1', 'src/bar.ts');
    });

    it('returns empty array when no comments exist', async () => {
      dbMock.getLineComments.mockResolvedValue([]);

      const result = await callHandler('lineComments:get', { taskId: 'task-empty' });

      expect(result).toEqual({ success: true, comments: [] });
    });

    it('returns failure when db throws', async () => {
      dbMock.getLineComments.mockRejectedValue(new Error('DB read error'));

      const result = await callHandler('lineComments:get', { taskId: 't1' });

      expect(result).toEqual({ success: false, error: 'DB read error' });
    });
  });

  describe('lineComments:update', () => {
    it('returns success when comment is updated', async () => {
      dbMock.updateLineComment.mockResolvedValue(undefined);

      const result = await callHandler('lineComments:update', {
        id: 'c1',
        content: 'Updated content',
      });

      expect(result).toEqual({ success: true });
      expect(dbMock.updateLineComment).toHaveBeenCalledWith('c1', 'Updated content');
    });

    it('returns failure when db throws', async () => {
      dbMock.updateLineComment.mockRejectedValue(new Error('row not found'));

      const result = await callHandler('lineComments:update', { id: 'ghost', content: 'x' });

      expect(result).toEqual({ success: false, error: 'row not found' });
    });
  });

  describe('lineComments:delete', () => {
    it('returns success when comment is deleted', async () => {
      dbMock.deleteLineComment.mockResolvedValue(undefined);

      const result = await callHandler('lineComments:delete', 'c1');

      expect(result).toEqual({ success: true });
      expect(dbMock.deleteLineComment).toHaveBeenCalledWith('c1');
    });

    it('returns failure when db throws', async () => {
      dbMock.deleteLineComment.mockRejectedValue(new Error('not found'));

      const result = await callHandler('lineComments:delete', 'missing-id');

      expect(result).toEqual({ success: false, error: 'not found' });
    });
  });

  describe('lineComments:getFormatted', () => {
    it('returns formatted XML string for task comments', async () => {
      const comments = [
        { filePath: 'src/foo.ts', lineNumber: 10, content: 'Fix the null check' },
        { filePath: 'src/foo.ts', lineNumber: 20, content: 'Add a test' },
      ];
      dbMock.getLineComments.mockResolvedValue(comments);

      const result = await callHandler('lineComments:getFormatted', 'task-fmt-1');

      expect(result.success).toBe(true);
      expect(typeof result.formatted).toBe('string');
      // The real formatCommentsForAgent wraps output in <user_comments>
      expect(result.formatted).toContain('<user_comments>');
      expect(result.formatted).toContain('src/foo.ts');
      expect(result.formatted).toContain('Fix the null check');
    });

    it('returns empty string when no comments exist', async () => {
      dbMock.getLineComments.mockResolvedValue([]);

      const result = await callHandler('lineComments:getFormatted', 'task-no-comments');

      expect(result.success).toBe(true);
      expect(result.formatted).toBe('');
    });

    it('groups comments by file correctly in formatted output', async () => {
      const comments = [
        { filePath: 'src/a.ts', lineNumber: 1, content: 'Comment A' },
        { filePath: 'src/b.ts', lineNumber: 2, content: 'Comment B' },
      ];
      dbMock.getLineComments.mockResolvedValue(comments);

      const result = await callHandler('lineComments:getFormatted', 'task-multifile');

      expect(result.formatted).toContain('src/a.ts');
      expect(result.formatted).toContain('src/b.ts');
      expect(result.formatted).toContain('Comment A');
      expect(result.formatted).toContain('Comment B');
    });

    it('returns failure when db throws', async () => {
      dbMock.getLineComments.mockRejectedValue(new Error('query failed'));

      const result = await callHandler('lineComments:getFormatted', 'task-err');

      expect(result).toEqual({ success: false, error: 'query failed' });
    });

    it('fetches all comments (no filePath filter) for getFormatted', async () => {
      dbMock.getLineComments.mockResolvedValue([]);

      await callHandler('lineComments:getFormatted', 'task-all');

      // Should call without a filePath — just the taskId
      expect(dbMock.getLineComments).toHaveBeenCalledWith('task-all');
    });
  });

  describe('lineComments:markSent', () => {
    it('returns success when comments are marked sent', async () => {
      dbMock.markCommentsSent.mockResolvedValue(undefined);

      const result = await callHandler('lineComments:markSent', ['c1', 'c2', 'c3']);

      expect(result).toEqual({ success: true });
      expect(dbMock.markCommentsSent).toHaveBeenCalledWith(['c1', 'c2', 'c3']);
    });

    it('handles empty array of comment ids', async () => {
      dbMock.markCommentsSent.mockResolvedValue(undefined);

      const result = await callHandler('lineComments:markSent', []);

      expect(result).toEqual({ success: true });
      expect(dbMock.markCommentsSent).toHaveBeenCalledWith([]);
    });

    it('returns failure when db throws', async () => {
      dbMock.markCommentsSent.mockRejectedValue(new Error('batch update failed'));

      const result = await callHandler('lineComments:markSent', ['c1']);

      expect(result).toEqual({ success: false, error: 'batch update failed' });
    });
  });

  describe('lineComments:getUnsent', () => {
    it('returns unsent comments for a task', async () => {
      const unsent = [
        { id: 'u1', taskId: 'task-1', filePath: 'src/foo.ts', lineNumber: 3, content: 'Pending' },
      ];
      dbMock.getUnsentComments.mockResolvedValue(unsent);

      const result = await callHandler('lineComments:getUnsent', 'task-1');

      expect(result).toEqual({ success: true, comments: unsent });
      expect(dbMock.getUnsentComments).toHaveBeenCalledWith('task-1');
    });

    it('returns empty array when all comments have been sent', async () => {
      dbMock.getUnsentComments.mockResolvedValue([]);

      const result = await callHandler('lineComments:getUnsent', 'task-sent');

      expect(result).toEqual({ success: true, comments: [] });
    });

    it('returns failure when db throws', async () => {
      dbMock.getUnsentComments.mockRejectedValue(new Error('unsent query error'));

      const result = await callHandler('lineComments:getUnsent', 'task-fail');

      expect(result).toEqual({ success: false, error: 'unsent query error' });
    });
  });

  describe('handler registration', () => {
    it('registers all seven IPC channels', () => {
      const expectedChannels = [
        'lineComments:create',
        'lineComments:get',
        'lineComments:update',
        'lineComments:delete',
        'lineComments:getFormatted',
        'lineComments:markSent',
        'lineComments:getUnsent',
      ];

      for (const channel of expectedChannels) {
        expect(ipcHandlers.has(channel)).toBe(true);
      }
    });
  });
});
