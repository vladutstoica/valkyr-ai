import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';

// --- Shared mock state ---

// The drizzle `db` mock exposes a fluent query builder.
// Each method returns an object that chains further, and the terminal
// call (e.g. await) resolves via the `_result` store.
const mockDbResults: Record<string, any> = {};

function makeChain(overrideResult?: any) {
  const chain: any = {
    _result: overrideResult,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    run: vi.fn(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
    // Make the chain itself thenable so `await chain` works
    then: undefined as any,
  };
  return chain;
}

// The mock db returned by getDrizzleClient()
const mockDb: any = makeChain();

// Override transaction to accept a callback and execute it with a tx mock
mockDb.transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => {
  const tx = makeChain();
  tx.transaction = mockDb.transaction;
  tx.select = vi.fn().mockReturnValue(makeChain([]));
  tx.insert = vi.fn().mockReturnValue(makeChain(undefined));
  tx.update = vi.fn().mockReturnValue(makeChain(undefined));
  tx.delete = vi.fn().mockReturnValue(makeChain(undefined));
  return cb(tx);
});

// --- Module mocks (must be declared before any imports that pull them) ---

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir()),
    getName: vi.fn().mockReturnValue('valkyr-test'),
    getVersion: vi.fn().mockReturnValue('0.0.0-test'),
    getAppPath: vi.fn().mockReturnValue(os.tmpdir()),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../main/errorTracking', () => ({
  errorTracking: {
    captureDatabaseError: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../main/db/path', () => ({
  resolveDatabasePath: vi.fn().mockReturnValue(':memory:'),
  resolveMigrationsPath: vi.fn().mockReturnValue(null),
}));

vi.mock('../../main/db/drizzleClient', () => ({
  getDrizzleClient: vi.fn().mockResolvedValue({ db: mockDb }),
  resetDrizzleClient: vi.fn().mockResolvedValue(undefined),
}));

// Mock sqlite3 — the service dynamically imports it; we intercept the call
vi.mock('sqlite3', () => {
  const mockSqlite3Db = {
    close: vi.fn((cb: (err: null) => void) => cb(null)),
    all: vi.fn(),
    run: vi.fn(),
    exec: vi.fn(),
    get: vi.fn(),
  };
  return {
    default: {
      Database: vi.fn(() => mockSqlite3Db),
    },
    Database: vi.fn(() => mockSqlite3Db),
  };
});

vi.mock('drizzle-orm/migrator', () => ({
  readMigrationFiles: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Helpers: produce minimal DB row shapes the mapper methods expect
// ---------------------------------------------------------------------------

function makeProjectRow(overrides: Record<string, any> = {}) {
  return {
    id: 'proj-1',
    name: 'My Project',
    path: '/home/user/project',
    gitRemote: 'origin',
    gitBranch: 'main',
    baseRef: null,
    githubRepository: null,
    githubConnected: 0,
    sshConnectionId: null,
    isRemote: 0,
    remotePath: null,
    subRepos: null,
    displayOrder: 0,
    groupId: null,
    workspaceId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTaskRow(overrides: Record<string, any> = {}) {
  return {
    id: 'task-1',
    projectId: 'proj-1',
    name: 'My Task',
    branch: 'feature/test',
    path: '/home/user/project',
    status: 'idle',
    agentId: null,
    metadata: null,
    useWorktree: 1,
    archivedAt: null,
    isPinned: 0,
    lastAgent: null,
    lockedAgent: null,
    initialPromptSent: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeConversationRow(overrides: Record<string, any> = {}) {
  return {
    id: 'conv-1',
    taskId: 'task-1',
    title: 'Default Conversation',
    provider: null,
    mode: 'pty',
    acpSessionId: null,
    isActive: 0,
    isMain: 1,
    displayOrder: 0,
    metadata: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessageRow(overrides: Record<string, any> = {}) {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    content: 'Hello',
    sender: 'user',
    parts: null,
    metadata: null,
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProjectGroupRow(overrides: Record<string, any> = {}) {
  return {
    id: 'grp-1',
    name: 'My Group',
    displayOrder: 0,
    isCollapsed: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWorkspaceRow(overrides: Record<string, any> = {}) {
  return {
    id: 'ws-1',
    name: 'Default',
    color: 'blue',
    emoji: null,
    displayOrder: 0,
    isDefault: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a thenable chain that resolves to `rows`
// This lets `await db.select().from(...).where(...).limit(1)` work.
// ---------------------------------------------------------------------------
function thenableRows(rows: any[]) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    run: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
  };
  // Make the object itself awaitable
  obj.then = (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject);
  return obj;
}

// ---------------------------------------------------------------------------
// Reset mocks before each test and re-wire mockDb
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the mockDb fluent chain defaults
  mockDb.select = vi.fn().mockReturnValue(thenableRows([]));
  mockDb.insert = vi.fn().mockReturnValue(thenableRows([]));
  mockDb.update = vi.fn().mockReturnValue(thenableRows([]));
  mockDb.delete = vi.fn().mockReturnValue(thenableRows([]));
  mockDb.transaction = vi.fn(async (cb: (tx: any) => Promise<any>) => {
    const tx = {
      select: vi.fn().mockReturnValue(thenableRows([])),
      insert: vi.fn().mockReturnValue(thenableRows([])),
      update: vi.fn().mockReturnValue(thenableRows([])),
      delete: vi.fn().mockReturnValue(thenableRows([])),
    };
    return cb(tx);
  });
});

// ---------------------------------------------------------------------------
// Import the class under test after all mocks are in place
// ---------------------------------------------------------------------------

async function getService() {
  vi.resetModules();
  const { DatabaseService } = await import('../../main/services/DatabaseService');
  return new DatabaseService();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatabaseService', () => {
  // =========================================================================
  // disabled flag
  // =========================================================================

  describe('when VALKYR_DISABLE_NATIVE_DB=1', () => {
    beforeEach(() => {
      process.env.VALKYR_DISABLE_NATIVE_DB = '1';
    });
    afterEach(() => {
      delete process.env.VALKYR_DISABLE_NATIVE_DB;
    });

    it('getProjects returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getProjects()).toEqual([]);
    });

    it('getTasks returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getTasks()).toEqual([]);
    });

    it('getConversations returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getConversations('task-1')).toEqual([]);
    });

    it('getMessages returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getMessages('conv-1')).toEqual([]);
    });

    it('getProjectGroups returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getProjectGroups()).toEqual([]);
    });

    it('getWorkspaces returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getWorkspaces()).toEqual([]);
    });

    it('saveProject resolves without error', async () => {
      const svc = await getService();
      await expect(
        svc.saveProject({
          id: 'p1',
          name: 'Test',
          path: '/tmp/test',
          gitInfo: { isGitRepo: false },
        })
      ).resolves.toBeUndefined();
    });

    it('saveTask resolves without error', async () => {
      const svc = await getService();
      await expect(
        svc.saveTask({
          id: 't1',
          projectId: 'p1',
          name: 'Task',
          branch: 'main',
          path: '/tmp',
          status: 'idle',
          createdAt: '',
          updatedAt: '',
        } as any)
      ).resolves.toBeUndefined();
    });

    it('deleteProject resolves without error', async () => {
      const svc = await getService();
      await expect(svc.deleteProject('p1')).resolves.toBeUndefined();
    });

    it('deleteTask resolves without error', async () => {
      const svc = await getService();
      await expect(svc.deleteTask('t1')).resolves.toBeUndefined();
    });

    it('getAppState returns default state', async () => {
      const svc = await getService();
      const state = await svc.getAppState();
      expect(state).toEqual({
        activeProjectId: null,
        activeTaskId: null,
        activeWorkspaceId: null,
        prMode: null,
        prDraft: false,
      });
    });

    it('getPinnedTaskIds returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getPinnedTaskIds()).toEqual([]);
    });

    it('getOrCreateDefaultConversation returns stub conversation', async () => {
      const svc = await getService();
      const conv = await svc.getOrCreateDefaultConversation('task-1');
      expect(conv.taskId).toBe('task-1');
      expect(conv.title).toBe('Default Conversation');
      expect(conv.isMain).toBe(true);
    });

    it('createConversation returns stub conversation when disabled', async () => {
      const svc = await getService();
      const conv = await svc.createConversation('task-1', 'Chat', 'claude', true, 'pty');
      expect(conv.taskId).toBe('task-1');
      expect(conv.title).toBe('Chat');
      expect(conv.provider).toBe('claude');
    });

    it('getKanbanStatuses returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getKanbanStatuses()).toEqual([]);
    });

    it('getTerminalSessions returns empty array', async () => {
      const svc = await getService();
      expect(await svc.getTerminalSessions('task::key')).toEqual([]);
    });
  });

  // =========================================================================
  // Projects — getProjects
  // =========================================================================

  describe('getProjects', () => {
    it('returns mapped projects when rows exist', async () => {
      const row = makeProjectRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const projects = await svc.getProjects();

      expect(projects).toHaveLength(1);
      const p = projects[0];
      expect(p.id).toBe('proj-1');
      expect(p.name).toBe('My Project');
      expect(p.path).toBe('/home/user/project');
      expect(p.gitInfo.isGitRepo).toBe(true);
      expect(p.gitInfo.remote).toBe('origin');
      expect(p.gitInfo.branch).toBe('main');
      expect(p.isRemote).toBe(false);
      expect(p.groupId).toBeNull();
      expect(p.workspaceId).toBeNull();
    });

    it('returns empty array when no rows', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      const projects = await svc.getProjects();
      expect(projects).toEqual([]);
    });

    it('maps githubInfo when githubRepository is set', async () => {
      const row = makeProjectRow({
        githubRepository: 'owner/repo',
        githubConnected: 1,
      });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.githubInfo).toEqual({ repository: 'owner/repo', connected: true });
    });

    it('maps subRepos from JSON string', async () => {
      const subRepos = [
        {
          path: '/home/user/project/frontend',
          name: 'frontend',
          relativePath: 'frontend',
          gitInfo: { isGitRepo: true },
        },
      ];
      const row = makeProjectRow({ subRepos: JSON.stringify(subRepos) });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.subRepos).toHaveLength(1);
      expect(p.subRepos![0].name).toBe('frontend');
    });

    it('returns null subRepos on malformed JSON (does not throw)', async () => {
      const row = makeProjectRow({ subRepos: '{invalid-json}' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.subRepos).toBeNull();
    });

    it('maps isRemote=1 to true', async () => {
      const row = makeProjectRow({ isRemote: 1, remotePath: '/remote/path' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.isRemote).toBe(true);
      expect(p.remotePath).toBe('/remote/path');
    });
  });

  // =========================================================================
  // Projects — getProjectById
  // =========================================================================

  describe('getProjectById', () => {
    it('returns the matching project', async () => {
      const row = makeProjectRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const p = await svc.getProjectById('proj-1');
      expect(p).not.toBeNull();
      expect(p!.id).toBe('proj-1');
    });

    it('returns null when no rows found', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      const p = await svc.getProjectById('nonexistent');
      expect(p).toBeNull();
    });

    it('throws when projectId is empty', async () => {
      const svc = await getService();
      await expect(svc.getProjectById('')).rejects.toThrow('projectId is required');
    });
  });

  // =========================================================================
  // Projects — saveProject
  // =========================================================================

  describe('saveProject', () => {
    it('calls db.insert with correct fields', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.saveProject({
        id: 'proj-new',
        name: 'New Project',
        path: '/tmp/new',
        gitInfo: { isGitRepo: true, remote: 'origin', branch: 'main' },
      });

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(insertChain.values).toHaveBeenCalledTimes(1);
      const insertedValues = insertChain.values.mock.calls[0][0];
      expect(insertedValues.id).toBe('proj-new');
      expect(insertedValues.name).toBe('New Project');
      expect(insertedValues.path).toBe('/tmp/new');
      expect(insertedValues.gitRemote).toBe('origin');
      expect(insertedValues.gitBranch).toBe('main');
    });

    it('serialises subRepos to JSON', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const subRepos = [{ path: '/a', name: 'a', relativePath: 'a', gitInfo: { isGitRepo: true } }];
      const svc = await getService();
      await svc.saveProject({
        id: 'p2',
        name: 'Multi',
        path: '/tmp/multi',
        subRepos,
        gitInfo: { isGitRepo: false },
      });

      const inserted = insertChain.values.mock.calls[0][0];
      expect(JSON.parse(inserted.subRepos)).toEqual(subRepos);
    });

    it('sets subRepos to null when empty array', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.saveProject({
        id: 'p3',
        name: 'Solo',
        path: '/tmp/solo',
        subRepos: [],
        gitInfo: { isGitRepo: false },
      });

      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.subRepos).toBeNull();
    });
  });

  // =========================================================================
  // Projects — updateProjectName
  // =========================================================================

  describe('updateProjectName', () => {
    it('throws when projectId is empty', async () => {
      const svc = await getService();
      await expect(svc.updateProjectName('', 'New Name')).rejects.toThrow('projectId is required');
    });

    it('throws when name is empty string', async () => {
      const svc = await getService();
      await expect(svc.updateProjectName('proj-1', '   ')).rejects.toThrow('name cannot be empty');
    });

    it('calls db.update and then returns updated project', async () => {
      const updatedRow = makeProjectRow({ name: 'Updated' });
      let callCount = 0;
      // First call is for update, second call is for re-fetch (getProjectById)
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        return thenableRows(callCount === 1 ? [updatedRow] : [updatedRow]);
      });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      const result = await svc.updateProjectName('proj-1', 'Updated');

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated'); // mapped from the mocked row returned by getProjectById
    });
  });

  // =========================================================================
  // Projects — updateProjectBaseRef
  // =========================================================================

  describe('updateProjectBaseRef', () => {
    it('throws when projectId is empty', async () => {
      const svc = await getService();
      await expect(svc.updateProjectBaseRef('', 'origin/main')).rejects.toThrow(
        'projectId is required'
      );
    });

    it('throws when baseRef is empty', async () => {
      const svc = await getService();
      await expect(svc.updateProjectBaseRef('proj-1', '  ')).rejects.toThrow(
        'baseRef cannot be empty'
      );
    });

    it('throws when project is not found', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      await expect(svc.updateProjectBaseRef('nonexistent', 'origin/main')).rejects.toThrow(
        'Project not found: nonexistent'
      );
    });

    it('updates baseRef and returns project', async () => {
      const partialRow = { id: 'proj-1', gitRemote: 'origin', gitBranch: 'main' };
      const fullRow = makeProjectRow({ baseRef: 'origin/main' });
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        // First select fetches partial row for the existing project
        // Subsequent selects for getProjectById
        return thenableRows(selectCallCount === 1 ? [partialRow] : [fullRow]);
      });
      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      const result = await svc.updateProjectBaseRef('proj-1', 'origin/main');

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
    });
  });

  // =========================================================================
  // Projects — deleteProject
  // =========================================================================

  describe('deleteProject', () => {
    it('calls db.delete', async () => {
      const deleteChain = {
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.delete = vi.fn().mockReturnValue(deleteChain);

      const svc = await getService();
      await svc.deleteProject('proj-1');

      expect(mockDb.delete).toHaveBeenCalledTimes(1);
      expect(deleteChain.where).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Projects — updateProjectOrder
  // =========================================================================

  describe('updateProjectOrder', () => {
    it('runs a transaction updating each project displayOrder', async () => {
      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockDb.transaction = vi.fn(async (cb: any) => cb(txMock));

      const svc = await getService();
      await svc.updateProjectOrder(['p1', 'p2', 'p3']);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(txMock.update).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Tasks — getTasks
  // =========================================================================

  describe('getTasks', () => {
    it('returns mapped tasks when rows exist', async () => {
      const row = makeTaskRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const tasks = await svc.getTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
      expect(tasks[0].status).toBe('idle');
      expect(tasks[0].useWorktree).toBe(true);
      expect(tasks[0].isPinned).toBe(false);
    });

    it('returns empty array when no rows', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      expect(await svc.getTasks()).toEqual([]);
    });

    it('parses task metadata JSON', async () => {
      const row = makeTaskRow({ metadata: '{"key":"value"}' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [task] = await svc.getTasks();
      expect(task.metadata).toEqual({ key: 'value' });
    });

    it('returns null metadata for malformed JSON', async () => {
      const row = makeTaskRow({ metadata: '{bad json}' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [task] = await svc.getTasks();
      expect(task.metadata).toBeNull();
    });

    it('filters by projectId when provided', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      await svc.getTasks('proj-1');

      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('maps isPinned=1 to true', async () => {
      const row = makeTaskRow({ isPinned: 1 });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [task] = await svc.getTasks();
      expect(task.isPinned).toBe(true);
    });

    it('maps initialPromptSent=1 to true', async () => {
      const row = makeTaskRow({ initialPromptSent: 1 });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [task] = await svc.getTasks();
      expect(task.initialPromptSent).toBe(true);
    });
  });

  // =========================================================================
  // Tasks — getArchivedTasks
  // =========================================================================

  describe('getArchivedTasks', () => {
    it('returns archived tasks with archivedAt set', async () => {
      const row = makeTaskRow({ archivedAt: '2024-06-01T00:00:00.000Z' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const tasks = await svc.getArchivedTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].archivedAt).toBe('2024-06-01T00:00:00.000Z');
    });

    it('filters by projectId when provided', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      await svc.getArchivedTasks('proj-1');
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Tasks — saveTask
  // =========================================================================

  describe('saveTask', () => {
    it('calls db.insert with mapped fields', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.saveTask({
        id: 't1',
        projectId: 'p1',
        name: 'Task 1',
        branch: 'feature/x',
        path: '/tmp/t1',
        status: 'active',
        useWorktree: true,
      } as any);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.id).toBe('t1');
      expect(inserted.status).toBe('active');
      expect(inserted.useWorktree).toBe(1);
    });

    it('serialises object metadata to JSON', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.saveTask({
        id: 't2',
        projectId: 'p1',
        name: 'Task 2',
        branch: 'main',
        path: '/tmp/t2',
        status: 'idle',
        metadata: { info: 'test' },
        useWorktree: false,
      } as any);

      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.metadata).toBe('{"info":"test"}');
      expect(inserted.useWorktree).toBe(0);
    });
  });

  // =========================================================================
  // Tasks — getTaskByPath
  // =========================================================================

  describe('getTaskByPath', () => {
    it('returns task when found', async () => {
      const row = makeTaskRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const task = await svc.getTaskByPath('/home/user/project');
      expect(task).not.toBeNull();
      expect(task!.path).toBe('/home/user/project');
    });

    it('returns null when no row found', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      const task = await svc.getTaskByPath('/nonexistent');
      expect(task).toBeNull();
    });
  });

  // =========================================================================
  // Tasks — deleteTask
  // =========================================================================

  describe('deleteTask', () => {
    it('calls db.delete', async () => {
      const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete = vi.fn().mockReturnValue(deleteChain);

      const svc = await getService();
      await svc.deleteTask('task-1');
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Tasks — archiveTask / restoreTask
  // =========================================================================

  describe('archiveTask', () => {
    it('updates archivedAt and resets status to idle', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.archiveTask('task-1');

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.status).toBe('idle');
      expect(setArgs.archivedAt).toBeTruthy();
    });
  });

  describe('restoreTask', () => {
    it('sets archivedAt to null', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.restoreTask('task-1');

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.archivedAt).toBeNull();
    });
  });

  // =========================================================================
  // Tasks — setTaskPinned / getPinnedTaskIds
  // =========================================================================

  describe('setTaskPinned', () => {
    it('sets isPinned=1 when pinned=true', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setTaskPinned('task-1', true);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.isPinned).toBe(1);
    });

    it('sets isPinned=0 when pinned=false', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setTaskPinned('task-1', false);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.isPinned).toBe(0);
    });
  });

  describe('getPinnedTaskIds', () => {
    it('returns array of pinned task IDs', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([{ id: 't1' }, { id: 't2' }]));

      const svc = await getService();
      const ids = await svc.getPinnedTaskIds();
      expect(ids).toEqual(['t1', 't2']);
    });

    it('returns empty array when no pinned tasks', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      expect(await svc.getPinnedTaskIds()).toEqual([]);
    });
  });

  // =========================================================================
  // Tasks — setTaskAgent
  // =========================================================================

  describe('setTaskAgent', () => {
    it('sets lastAgent and lockedAgent', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setTaskAgent('task-1', { lastAgent: 'claude', lockedAgent: null });

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.lastAgent).toBe('claude');
      expect(setArgs.lockedAgent).toBeNull();
    });

    it('only sets fields that are present in the update object', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setTaskAgent('task-1', { lastAgent: 'codex' });

      const setArgs = updateChain.set.mock.calls[0][0];
      expect('lastAgent' in setArgs).toBe(true);
      expect('lockedAgent' in setArgs).toBe(false);
    });
  });

  // =========================================================================
  // Tasks — setTaskInitialPromptSent
  // =========================================================================

  describe('setTaskInitialPromptSent', () => {
    it('sets initialPromptSent=1 when sent=true', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setTaskInitialPromptSent('task-1', true);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.initialPromptSent).toBe(1);
    });
  });

  // =========================================================================
  // Conversations — getConversations
  // =========================================================================

  describe('getConversations', () => {
    it('returns mapped conversations', async () => {
      const row = makeConversationRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const convs = await svc.getConversations('task-1');

      expect(convs).toHaveLength(1);
      const c = convs[0];
      expect(c.id).toBe('conv-1');
      expect(c.taskId).toBe('task-1');
      expect(c.isMain).toBe(true);
      expect(c.isActive).toBe(false);
      expect(c.mode).toBe('pty');
    });

    it('returns empty array when no rows', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      expect(await svc.getConversations('task-1')).toEqual([]);
    });

    it('handles isMain undefined (backward compat: defaults to true)', async () => {
      const row = makeConversationRow({ isMain: undefined });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [conv] = await svc.getConversations('task-1');
      expect(conv.isMain).toBe(true);
    });

    it('maps isActive=1 to true', async () => {
      const row = makeConversationRow({ isActive: 1 });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [conv] = await svc.getConversations('task-1');
      expect(conv.isActive).toBe(true);
    });
  });

  // =========================================================================
  // Conversations — saveConversation
  // =========================================================================

  describe('saveConversation', () => {
    it('calls db.insert with correct fields', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.saveConversation({
        id: 'conv-new',
        taskId: 'task-1',
        title: 'New Chat',
        isMain: true,
        isActive: true,
        mode: 'acp',
      });

      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.id).toBe('conv-new');
      expect(inserted.taskId).toBe('task-1');
      expect(inserted.isMain).toBe(1);
      expect(inserted.isActive).toBe(1);
      expect(inserted.mode).toBe('acp');
    });

    it('defaults mode to "pty" when not specified', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.saveConversation({
        id: 'conv-2',
        taskId: 'task-1',
        title: 'Default',
      });

      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.mode).toBe('pty');
    });
  });

  // =========================================================================
  // Conversations — deleteConversation
  // =========================================================================

  describe('deleteConversation', () => {
    it('calls db.delete', async () => {
      const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete = vi.fn().mockReturnValue(deleteChain);

      const svc = await getService();
      await svc.deleteConversation('conv-1');
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Conversations — getOrCreateDefaultConversation
  // =========================================================================

  describe('getOrCreateDefaultConversation', () => {
    it('returns existing conversation when one exists', async () => {
      const row = makeConversationRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const conv = await svc.getOrCreateDefaultConversation('task-1');
      expect(conv.id).toBe('conv-1');
    });

    it('creates conversation when none exists and returns it', async () => {
      const createdRow = makeConversationRow({ id: 'conv-new' });
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        // First call: no existing conversations
        // Second call: fetch newly created conversation
        return thenableRows(selectCallCount === 1 ? [] : [createdRow]);
      });

      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      const conv = await svc.getOrCreateDefaultConversation('task-1');

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(conv).toBeTruthy();
    });
  });

  // =========================================================================
  // Conversations — getActiveConversation / setActiveConversation
  // =========================================================================

  describe('getActiveConversation', () => {
    it('returns active conversation', async () => {
      const row = makeConversationRow({ isActive: 1 });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const conv = await svc.getActiveConversation('task-1');
      expect(conv).not.toBeNull();
      expect(conv!.isActive).toBe(true);
    });

    it('returns null when no active conversation', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      const conv = await svc.getActiveConversation('task-1');
      expect(conv).toBeNull();
    });
  });

  describe('setActiveConversation', () => {
    it('runs a transaction deactivating all then activating target', async () => {
      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockDb.transaction = vi.fn(async (cb: any) => cb(txMock));

      const svc = await getService();
      await svc.setActiveConversation('task-1', 'conv-1');

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      // Two update calls: deactivate all, then activate one
      expect(txMock.update).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Conversations — updateConversationAcpSessionId / updateConversationTitle
  // =========================================================================

  describe('updateConversationAcpSessionId', () => {
    it('calls db.update with acpSessionId', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.updateConversationAcpSessionId('conv-1', 'session-abc');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.acpSessionId).toBe('session-abc');
    });
  });

  describe('updateConversationTitle', () => {
    it('calls db.update with new title', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.updateConversationTitle('conv-1', 'New Title');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.title).toBe('New Title');
    });
  });

  // =========================================================================
  // Conversations — reorderConversations
  // =========================================================================

  describe('reorderConversations', () => {
    it('runs a transaction updating displayOrder for each conversation', async () => {
      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockDb.transaction = vi.fn(async (cb: any) => cb(txMock));

      const svc = await getService();
      await svc.reorderConversations('task-1', ['conv-a', 'conv-b', 'conv-c']);

      expect(txMock.update).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Messages — saveMessage / getMessages
  // =========================================================================

  describe('saveMessage', () => {
    it('runs a transaction inserting message and touching conversation', async () => {
      const txMock = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockDb.transaction = vi.fn(async (cb: any) => cb(txMock));

      const svc = await getService();
      await svc.saveMessage({
        id: 'msg-1',
        conversationId: 'conv-1',
        content: 'Hello world',
        sender: 'user',
      });

      expect(txMock.insert).toHaveBeenCalledTimes(1);
      expect(txMock.update).toHaveBeenCalledTimes(1);
    });

    it('serialises object metadata to JSON', async () => {
      const txMock = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockDb.transaction = vi.fn(async (cb: any) => cb(txMock));

      const svc = await getService();
      await svc.saveMessage({
        id: 'msg-2',
        conversationId: 'conv-1',
        content: 'Test',
        sender: 'agent',
        metadata: { tokens: 100 } as any,
      });

      const insertValues = txMock.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(insertValues.metadata).toBe('{"tokens":100}');
    });
  });

  describe('getMessages', () => {
    it('returns mapped messages', async () => {
      const row = makeMessageRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const messages = await svc.getMessages('conv-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].sender).toBe('user');
    });

    it('returns empty array when no messages', async () => {
      mockDb.select = vi.fn().mockReturnValue(thenableRows([]));

      const svc = await getService();
      expect(await svc.getMessages('conv-1')).toEqual([]);
    });
  });

  // =========================================================================
  // Project Groups
  // =========================================================================

  describe('getProjectGroups', () => {
    it('returns mapped project groups', async () => {
      const row = makeProjectGroupRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const groups = await svc.getProjectGroups();

      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('grp-1');
      expect(groups[0].isCollapsed).toBe(false);
    });

    it('maps isCollapsed=1 to true', async () => {
      const row = makeProjectGroupRow({ isCollapsed: 1 });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [group] = await svc.getProjectGroups();
      expect(group.isCollapsed).toBe(true);
    });
  });

  describe('createProjectGroup', () => {
    it('inserts a group and returns it', async () => {
      const groupRow = makeProjectGroupRow({ id: 'grp-new', name: 'New Group' });
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        return thenableRows(selectCallCount === 1 ? [] : [groupRow]);
      });

      const insertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      const group = await svc.createProjectGroup('New Group');

      expect(group.name).toBe('New Group');
    });

    it('throws when database is disabled', async () => {
      process.env.VALKYR_DISABLE_NATIVE_DB = '1';
      try {
        const svc = await getService();
        await expect(svc.createProjectGroup('Test')).rejects.toThrow('Database is disabled');
      } finally {
        delete process.env.VALKYR_DISABLE_NATIVE_DB;
      }
    });
  });

  describe('renameProjectGroup', () => {
    it('calls db.update with new name', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.renameProjectGroup('grp-1', 'Renamed');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.name).toBe('Renamed');
    });
  });

  describe('deleteProjectGroup', () => {
    it('calls db.delete', async () => {
      const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete = vi.fn().mockReturnValue(deleteChain);

      const svc = await getService();
      await svc.deleteProjectGroup('grp-1');
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('setProjectGroup', () => {
    it('updates groupId on a project', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setProjectGroup('proj-1', 'grp-1');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.groupId).toBe('grp-1');
    });

    it('sets groupId to null (remove from group)', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setProjectGroup('proj-1', null);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.groupId).toBeNull();
    });
  });

  describe('toggleProjectGroupCollapsed', () => {
    it('sets isCollapsed=1 when collapsed=true', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.toggleProjectGroupCollapsed('grp-1', true);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.isCollapsed).toBe(1);
    });

    it('sets isCollapsed=0 when collapsed=false', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.toggleProjectGroupCollapsed('grp-1', false);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.isCollapsed).toBe(0);
    });
  });

  // =========================================================================
  // Workspaces
  // =========================================================================

  describe('getWorkspaces', () => {
    it('returns mapped workspaces', async () => {
      const row = makeWorkspaceRow();
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const workspaces = await svc.getWorkspaces();

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].id).toBe('ws-1');
      expect(workspaces[0].isDefault).toBe(true);
      expect(workspaces[0].color).toBe('blue');
    });

    it('maps isDefault=0 to false', async () => {
      const row = makeWorkspaceRow({ isDefault: 0 });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [ws] = await svc.getWorkspaces();
      expect(ws.isDefault).toBe(false);
    });
  });

  describe('renameWorkspace', () => {
    it('calls db.update with new name', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.renameWorkspace('ws-1', 'Renamed');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.name).toBe('Renamed');
    });
  });

  describe('updateWorkspaceColor', () => {
    it('calls db.update with new color', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.updateWorkspaceColor('ws-1', 'red');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.color).toBe('red');
    });
  });

  describe('updateWorkspaceEmoji', () => {
    it('sets emoji to a value', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.updateWorkspaceEmoji('ws-1', '🚀');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.emoji).toBe('🚀');
    });

    it('sets emoji to null', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.updateWorkspaceEmoji('ws-1', null);

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.emoji).toBeNull();
    });
  });

  describe('setProjectWorkspace', () => {
    it('updates workspaceId on a project', async () => {
      const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update = vi.fn().mockReturnValue(updateChain);

      const svc = await getService();
      await svc.setProjectWorkspace('proj-1', 'ws-2');

      const setArgs = updateChain.set.mock.calls[0][0];
      expect(setArgs.workspaceId).toBe('ws-2');
    });
  });

  // =========================================================================
  // App State
  // =========================================================================

  describe('getAppState', () => {
    it('returns state from row', async () => {
      const row = {
        id: 1,
        activeProjectId: 'proj-1',
        activeTaskId: 'task-1',
        activeWorkspaceId: 'ws-1',
        prMode: 'draft',
        prDraft: 1,
      };
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const state = await svc.getAppState();

      expect(state.activeProjectId).toBe('proj-1');
      expect(state.activeTaskId).toBe('task-1');
      expect(state.activeWorkspaceId).toBe('ws-1');
      expect(state.prMode).toBe('draft');
      expect(state.prDraft).toBe(true);
    });

    it('returns default state when no row exists', async () => {
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        return thenableRows([]);
      });
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      const state = await svc.getAppState();

      expect(state.activeProjectId).toBeNull();
      expect(state.prDraft).toBe(false);
    });
  });

  describe('updateAppState', () => {
    it('upserts with activeProjectId', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.updateAppState({ activeProjectId: 'proj-2' });

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const insertedValues = insertChain.values.mock.calls[0][0];
      expect(insertedValues.activeProjectId).toBe('proj-2');
    });

    it('does nothing when partial is empty', async () => {
      const svc = await getService();
      await svc.updateAppState({});
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('converts prDraft boolean to integer', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.updateAppState({ prDraft: true });

      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.prDraft).toBe(1);
    });
  });

  // =========================================================================
  // Kanban
  // =========================================================================

  describe('getKanbanStatuses', () => {
    it('returns task-status pairs', async () => {
      const rows = [
        { taskId: 't1', status: 'todo' },
        { taskId: 't2', status: 'done' },
      ];
      mockDb.select = vi.fn().mockReturnValue(thenableRows(rows));

      const svc = await getService();
      const statuses = await svc.getKanbanStatuses();

      expect(statuses).toEqual([
        { taskId: 't1', status: 'todo' },
        { taskId: 't2', status: 'done' },
      ]);
    });
  });

  describe('setKanbanStatus', () => {
    it('upserts kanban status', async () => {
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert = vi.fn().mockReturnValue(insertChain);

      const svc = await getService();
      await svc.setKanbanStatus('task-1', 'in_progress');

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      const inserted = insertChain.values.mock.calls[0][0];
      expect(inserted.taskId).toBe('task-1');
      expect(inserted.status).toBe('in_progress');
    });
  });

  // =========================================================================
  // Terminal Sessions
  // =========================================================================

  describe('getTerminalSessions', () => {
    it('returns mapped terminal sessions', async () => {
      const rows = [
        {
          id: 'ts-1',
          taskKey: 'task-1::key',
          terminalId: 'term-1',
          title: 'bash',
          cwd: '/home/user',
          isActive: 1,
          displayOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      mockDb.select = vi.fn().mockReturnValue(thenableRows(rows));

      const svc = await getService();
      const sessions = await svc.getTerminalSessions('task-1::key');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('ts-1');
      expect(sessions[0].isActive).toBe(true);
      expect(sessions[0].cwd).toBe('/home/user');
    });

    it('maps isActive=0 to false', async () => {
      const rows = [
        {
          id: 'ts-2',
          taskKey: 'key',
          terminalId: 'term-2',
          title: 'zsh',
          cwd: null,
          isActive: 0,
          displayOrder: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      mockDb.select = vi.fn().mockReturnValue(thenableRows(rows));

      const svc = await getService();
      const [session] = await svc.getTerminalSessions('key');
      expect(session.isActive).toBe(false);
      expect(session.cwd).toBeNull();
    });
  });

  describe('saveTerminalSessions', () => {
    it('runs a transaction deleting then inserting sessions', async () => {
      const txMock = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      mockDb.transaction = vi.fn(async (cb: any) => cb(txMock));

      const svc = await getService();
      await svc.saveTerminalSessions('task::key', [
        {
          id: 'ts-1',
          taskKey: 'task::key',
          terminalId: 'term-1',
          title: 'bash',
          cwd: null,
          isActive: true,
          displayOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]);

      expect(txMock.delete).toHaveBeenCalledTimes(1);
      expect(txMock.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteTerminalSessions', () => {
    it('calls db.delete', async () => {
      const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete = vi.fn().mockReturnValue(deleteChain);

      const svc = await getService();
      await svc.deleteTerminalSessions('task::key');
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // computeBaseRef (private — tested via saveProject / getProjects)
  // =========================================================================

  describe('computeBaseRef logic (via project mapping)', () => {
    it('uses remote/branch as fallback when no stored baseRef', async () => {
      // preferred=null, remote='origin', branch='develop' →
      // normalize(null)=undefined, normalize('develop')='origin/develop'
      const row = makeProjectRow({ gitRemote: 'origin', gitBranch: 'develop', baseRef: null });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.gitInfo.baseRef).toBe('origin/develop');
    });

    it('uses stored baseRef when set', async () => {
      const row = makeProjectRow({ gitRemote: 'origin', gitBranch: 'main', baseRef: 'upstream/main' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.gitInfo.baseRef).toBe('upstream/main');
    });

    it('falls back to "origin/main" when remote is null (null → defaults to "origin")', async () => {
      // getRemoteAlias(null) returns 'origin' (the default remote name), not ''
      // So: remoteName='origin', no preferred, no branch → defaultBranch='origin/main'
      const row = makeProjectRow({ gitRemote: null, gitBranch: null, baseRef: null });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.gitInfo.baseRef).toBe('origin/main');
    });

    it('falls back to "origin/main" when remote is empty string (empty is falsy, treated as null)', async () => {
      // !'' === true, so getRemoteAlias('') returns 'origin' (same as null case)
      // Therefore defaultBranch = 'origin/main'
      const row = makeProjectRow({ gitRemote: '', gitBranch: null, baseRef: null });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.gitInfo.baseRef).toBe('origin/main');
    });

    it('prepends defaultRemote to a plain branch name in baseRef', async () => {
      // Stored baseRef is just a plain branch name (no slash)
      const row = makeProjectRow({ gitRemote: 'origin', gitBranch: 'main', baseRef: 'develop' });
      mockDb.select = vi.fn().mockReturnValue(thenableRows([row]));

      const svc = await getService();
      const [p] = await svc.getProjects();
      expect(p.gitInfo.baseRef).toBe('origin/develop');
    });
  });

  // =========================================================================
  // getLastMigrationSummary
  // =========================================================================

  describe('getLastMigrationSummary', () => {
    it('returns null before any migration is run', async () => {
      const svc = await getService();
      expect(svc.getLastMigrationSummary()).toBeNull();
    });
  });
});
