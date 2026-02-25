import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock state ---

const ipcHandlers = new Map<string, (...args: any[]) => any>();

const dbMock = {
  getProjects: vi.fn(),
  saveProject: vi.fn(),
  updateProjectOrder: vi.fn(),
  getTasks: vi.fn(),
  saveTask: vi.fn(),
  deleteProject: vi.fn(),
  updateProjectName: vi.fn(),
  saveConversation: vi.fn(),
  getConversations: vi.fn(),
  getOrCreateDefaultConversation: vi.fn(),
  saveMessage: vi.fn(),
  getMessages: vi.fn(),
  deleteConversation: vi.fn(),
  updateConversationAcpSessionId: vi.fn(),
  deleteTask: vi.fn(),
  archiveTask: vi.fn(),
  restoreTask: vi.fn(),
  getArchivedTasks: vi.fn(),
  getProjectGroups: vi.fn(),
  createProjectGroup: vi.fn(),
  renameProjectGroup: vi.fn(),
  deleteProjectGroup: vi.fn(),
  updateProjectGroupOrder: vi.fn(),
  setProjectGroup: vi.fn(),
  toggleProjectGroupCollapsed: vi.fn(),
  getWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  updateWorkspaceOrder: vi.fn(),
  updateWorkspaceColor: vi.fn(),
  updateWorkspaceEmoji: vi.fn(),
  setProjectWorkspace: vi.fn(),
  createConversation: vi.fn(),
  setActiveConversation: vi.fn(),
  getActiveConversation: vi.fn(),
  reorderConversations: vi.fn(),
  updateConversationTitle: vi.fn(),
  getAppState: vi.fn(),
  updateAppState: vi.fn(),
  setTaskPinned: vi.fn(),
  getPinnedTaskIds: vi.fn(),
  setTaskAgent: vi.fn(),
  setTaskInitialPromptSent: vi.fn(),
  getTerminalSessions: vi.fn(),
  saveTerminalSessions: vi.fn(),
  deleteTerminalSessions: vi.fn(),
  getKanbanStatuses: vi.fn(),
  setKanbanStatus: vi.fn(),
};

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

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    rmSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    rmdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  rmdirSync: vi.fn(),
}));

async function callHandler(channel: string, ...args: any[]) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler for channel: ${channel}`);
  return handler({}, ...args);
}

beforeEach(async () => {
  vi.clearAllMocks();
  ipcHandlers.clear();
  vi.resetModules();

  // Re-apply mocks
  vi.mock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandlers.set(channel, cb);
      }),
    },
  }));

  const mod = await import('../../main/ipc/dbIpc');
  mod.registerDatabaseIpc();
});

describe('dbIpc', () => {
  // --- Projects ---

  describe('db:getProjects', () => {
    it('returns projects on success', async () => {
      const projects = [{ id: '1', name: 'Test' }];
      dbMock.getProjects.mockResolvedValue(projects);
      const result = await callHandler('db:getProjects');
      expect(result).toEqual(projects);
    });

    it('returns empty array on error', async () => {
      dbMock.getProjects.mockRejectedValue(new Error('DB error'));
      const result = await callHandler('db:getProjects');
      expect(result).toEqual([]);
    });
  });

  describe('db:saveProject', () => {
    it('returns success on save', async () => {
      dbMock.saveProject.mockResolvedValue(undefined);
      const result = await callHandler('db:saveProject', { id: '1', name: 'Test' });
      expect(result).toEqual({ success: true });
      expect(dbMock.saveProject).toHaveBeenCalledWith({ id: '1', name: 'Test' });
    });

    it('returns error on failure', async () => {
      dbMock.saveProject.mockRejectedValue(new Error('Save failed'));
      const result = await callHandler('db:saveProject', { id: '1' });
      expect(result).toEqual({ success: false, error: 'Save failed' });
    });
  });

  describe('db:deleteProject', () => {
    it('returns success', async () => {
      dbMock.deleteProject.mockResolvedValue(undefined);
      const result = await callHandler('db:deleteProject', 'proj-1');
      expect(result).toEqual({ success: true });
      expect(dbMock.deleteProject).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('db:renameProject', () => {
    it('returns success with updated project', async () => {
      const updated = { id: '1', name: 'New Name' };
      dbMock.updateProjectName.mockResolvedValue(updated);
      const result = await callHandler('db:renameProject', {
        projectId: '1',
        newName: 'New Name',
      });
      expect(result).toEqual({ success: true, project: updated });
    });
  });

  // --- Tasks ---

  describe('db:getTasks', () => {
    it('returns tasks', async () => {
      const tasks = [{ id: 't1' }];
      dbMock.getTasks.mockResolvedValue(tasks);
      const result = await callHandler('db:getTasks', 'proj-1');
      expect(result).toEqual(tasks);
    });

    it('returns empty array on error', async () => {
      dbMock.getTasks.mockRejectedValue(new Error('fail'));
      const result = await callHandler('db:getTasks');
      expect(result).toEqual([]);
    });
  });

  describe('db:saveTask', () => {
    it('returns success', async () => {
      dbMock.saveTask.mockResolvedValue(undefined);
      const result = await callHandler('db:saveTask', { id: 't1' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:deleteTask', () => {
    it('returns success', async () => {
      dbMock.deleteTask.mockResolvedValue(undefined);
      const result = await callHandler('db:deleteTask', 't1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:archiveTask', () => {
    it('returns success', async () => {
      dbMock.archiveTask.mockResolvedValue(undefined);
      const result = await callHandler('db:archiveTask', 't1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:restoreTask', () => {
    it('returns success', async () => {
      dbMock.restoreTask.mockResolvedValue(undefined);
      const result = await callHandler('db:restoreTask', 't1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:getArchivedTasks', () => {
    it('returns archived tasks', async () => {
      dbMock.getArchivedTasks.mockResolvedValue([{ id: 't1' }]);
      const result = await callHandler('db:getArchivedTasks', 'proj-1');
      expect(result).toEqual([{ id: 't1' }]);
    });
  });

  // --- Conversations ---

  describe('db:getConversations', () => {
    it('returns conversations', async () => {
      const convs = [{ id: 'c1' }];
      dbMock.getConversations.mockResolvedValue(convs);
      const result = await callHandler('db:getConversations', 't1');
      expect(result).toEqual({ success: true, conversations: convs });
    });
  });

  describe('db:saveConversation', () => {
    it('returns success', async () => {
      dbMock.saveConversation.mockResolvedValue(undefined);
      const result = await callHandler('db:saveConversation', { id: 'c1' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:deleteConversation', () => {
    it('returns success', async () => {
      dbMock.deleteConversation.mockResolvedValue(undefined);
      const result = await callHandler('db:deleteConversation', 'c1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:getOrCreateDefaultConversation', () => {
    it('returns conversation', async () => {
      const conv = { id: 'c1', title: 'Default' };
      dbMock.getOrCreateDefaultConversation.mockResolvedValue(conv);
      const result = await callHandler('db:getOrCreateDefaultConversation', 't1');
      expect(result).toEqual({ success: true, conversation: conv });
    });
  });

  describe('db:createConversation', () => {
    it('creates and returns conversation', async () => {
      const conv = { id: 'c2', title: 'New' };
      dbMock.createConversation.mockResolvedValue(conv);
      const result = await callHandler('db:createConversation', {
        taskId: 't1',
        title: 'New',
        provider: 'claude',
      });
      expect(result).toEqual({ success: true, conversation: conv });
    });
  });

  describe('db:setActiveConversation', () => {
    it('returns success', async () => {
      dbMock.setActiveConversation.mockResolvedValue(undefined);
      const result = await callHandler('db:setActiveConversation', {
        taskId: 't1',
        conversationId: 'c1',
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:getActiveConversation', () => {
    it('returns active conversation', async () => {
      const conv = { id: 'c1' };
      dbMock.getActiveConversation.mockResolvedValue(conv);
      const result = await callHandler('db:getActiveConversation', 't1');
      expect(result).toEqual({ success: true, conversation: conv });
    });
  });

  // --- Messages ---

  describe('db:saveMessage', () => {
    it('returns success', async () => {
      dbMock.saveMessage.mockResolvedValue(undefined);
      const result = await callHandler('db:saveMessage', { id: 'm1', content: 'hi' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:getMessages', () => {
    it('returns messages', async () => {
      const msgs = [{ id: 'm1' }];
      dbMock.getMessages.mockResolvedValue(msgs);
      const result = await callHandler('db:getMessages', 'c1');
      expect(result).toEqual({ success: true, messages: msgs });
    });
  });

  // --- Workspaces ---

  describe('db:getWorkspaces', () => {
    it('returns workspaces', async () => {
      const ws = [{ id: 'w1', name: 'Default' }];
      dbMock.getWorkspaces.mockResolvedValue(ws);
      const result = await callHandler('db:getWorkspaces');
      expect(result).toEqual({ success: true, workspaces: ws });
    });
  });

  describe('db:createWorkspace', () => {
    it('returns created workspace', async () => {
      const ws = { id: 'w2', name: 'New' };
      dbMock.createWorkspace.mockResolvedValue(ws);
      const result = await callHandler('db:createWorkspace', { name: 'New', color: '#ff0' });
      expect(result).toEqual({ success: true, workspace: ws });
    });
  });

  describe('db:deleteWorkspace', () => {
    it('returns success', async () => {
      dbMock.deleteWorkspace.mockResolvedValue(undefined);
      const result = await callHandler('db:deleteWorkspace', 'w1');
      expect(result).toEqual({ success: true });
    });

    it('returns error when deleting default workspace', async () => {
      dbMock.deleteWorkspace.mockRejectedValue(new Error('Cannot delete default workspace'));
      const result = await callHandler('db:deleteWorkspace', 'default');
      expect(result).toEqual({ success: false, error: 'Cannot delete default workspace' });
    });
  });

  // --- Project Groups ---

  describe('db:getProjectGroups', () => {
    it('returns groups', async () => {
      const groups = [{ id: 'g1', name: 'Group' }];
      dbMock.getProjectGroups.mockResolvedValue(groups);
      const result = await callHandler('db:getProjectGroups');
      expect(result).toEqual({ success: true, groups });
    });
  });

  describe('db:createProjectGroup', () => {
    it('returns created group', async () => {
      const group = { id: 'g1', name: 'New Group' };
      dbMock.createProjectGroup.mockResolvedValue(group);
      const result = await callHandler('db:createProjectGroup', 'New Group');
      expect(result).toEqual({ success: true, group });
    });
  });

  describe('db:deleteProjectGroup', () => {
    it('returns success', async () => {
      dbMock.deleteProjectGroup.mockResolvedValue(undefined);
      const result = await callHandler('db:deleteProjectGroup', 'g1');
      expect(result).toEqual({ success: true });
    });
  });

  // --- App State ---

  describe('db:appState:get', () => {
    it('returns app state', async () => {
      const state = { lastProjectId: 'p1' };
      dbMock.getAppState.mockResolvedValue(state);
      const result = await callHandler('db:appState:get');
      expect(result).toEqual({ success: true, data: state });
    });
  });

  describe('db:appState:update', () => {
    it('returns success', async () => {
      dbMock.updateAppState.mockResolvedValue(undefined);
      const result = await callHandler('db:appState:update', { lastProjectId: 'p2' });
      expect(result).toEqual({ success: true });
    });
  });

  // --- Task pinning ---

  describe('db:task:setPinned', () => {
    it('returns success', async () => {
      dbMock.setTaskPinned.mockResolvedValue(undefined);
      const result = await callHandler('db:task:setPinned', { taskId: 't1', pinned: true });
      expect(result).toEqual({ success: true });
    });
  });

  describe('db:task:getPinnedIds', () => {
    it('returns pinned IDs', async () => {
      dbMock.getPinnedTaskIds.mockResolvedValue(['t1', 't2']);
      const result = await callHandler('db:task:getPinnedIds');
      expect(result).toEqual({ success: true, data: ['t1', 't2'] });
    });
  });

  // --- Terminal Sessions ---

  describe('db:terminalSessions:get', () => {
    it('returns sessions', async () => {
      const sessions = [{ id: 's1' }];
      dbMock.getTerminalSessions.mockResolvedValue(sessions);
      const result = await callHandler('db:terminalSessions:get', 'task-key');
      expect(result).toEqual({ success: true, data: sessions });
    });
  });

  describe('db:terminalSessions:delete', () => {
    it('returns success', async () => {
      dbMock.deleteTerminalSessions.mockResolvedValue(undefined);
      const result = await callHandler('db:terminalSessions:delete', 'task-key');
      expect(result).toEqual({ success: true });
    });
  });

  // --- Kanban ---

  describe('db:kanban:getStatuses', () => {
    it('returns statuses', async () => {
      const statuses = [{ taskId: 't1', status: 'in_progress' }];
      dbMock.getKanbanStatuses.mockResolvedValue(statuses);
      const result = await callHandler('db:kanban:getStatuses');
      expect(result).toEqual({ success: true, data: statuses });
    });
  });

  describe('db:kanban:setStatus', () => {
    it('returns success', async () => {
      dbMock.setKanbanStatus.mockResolvedValue(undefined);
      const result = await callHandler('db:kanban:setStatus', {
        taskId: 't1',
        status: 'done',
      });
      expect(result).toEqual({ success: true });
    });
  });

  // --- Error path (generic) ---

  describe('error handling', () => {
    it('db:saveProject returns error on service throw', async () => {
      dbMock.saveProject.mockRejectedValue(new Error('constraint violation'));
      const result = await callHandler('db:saveProject', {});
      expect(result).toEqual({ success: false, error: 'constraint violation' });
    });

    it('db:getConversations returns error on service throw', async () => {
      dbMock.getConversations.mockRejectedValue(new Error('DB locked'));
      const result = await callHandler('db:getConversations', 't1');
      expect(result).toEqual({ success: false, error: 'DB locked' });
    });
  });
});
