import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const dbMock = {
  getProjectById: vi.fn(),
  updateProjectBaseRef: vi.fn(),
};

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir()),
    getName: vi.fn().mockReturnValue('valkyr-test'),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type ProjectFixture = {
  id: string;
  name: string;
  path: string;
  gitInfo: { remote: string; branch: string; baseRef: string };
};

function makeProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: 'proj-001',
    name: 'My Project',
    path: '/home/user/my-project',
    gitInfo: {
      remote: 'origin',
      branch: 'main',
      baseRef: 'main',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectSettingsService', () => {
  let service: typeof import('../../main/services/ProjectSettingsService').projectSettingsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.mock('electron', () => ({
      app: { getPath: vi.fn().mockReturnValue(os.tmpdir()) },
    }));
    vi.mock('../../main/lib/logger', () => ({
      log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.mock('../../main/services/DatabaseService', () => ({
      databaseService: dbMock,
    }));

    ({ projectSettingsService: service } = await import(
      '../../main/services/ProjectSettingsService'
    ));
  });

  // -------------------------------------------------------------------------
  // getProjectSettings
  // -------------------------------------------------------------------------

  describe('getProjectSettings', () => {
    it('returns null when project does not exist', async () => {
      dbMock.getProjectById.mockResolvedValue(null);

      const result = await service.getProjectSettings('nonexistent-id');

      expect(result).toBeNull();
      expect(dbMock.getProjectById).toHaveBeenCalledWith('nonexistent-id');
    });

    it('returns ProjectSettings mapped from project for existing project', async () => {
      const project = makeProject();
      dbMock.getProjectById.mockResolvedValue(project);

      const result = await service.getProjectSettings('proj-001');

      expect(result).toEqual({
        projectId: 'proj-001',
        name: 'My Project',
        path: '/home/user/my-project',
        gitRemote: 'origin',
        gitBranch: 'main',
        baseRef: 'main',
      });
    });

    it('maps gitInfo.remote correctly', async () => {
      const project = makeProject({
        gitInfo: { remote: 'upstream', branch: 'develop', baseRef: 'develop' },
      } as any);
      dbMock.getProjectById.mockResolvedValue(project);

      const result = await service.getProjectSettings('proj-001');

      expect(result!.gitRemote).toBe('upstream');
      expect(result!.gitBranch).toBe('develop');
      expect(result!.baseRef).toBe('develop');
    });

    it('maps undefined gitRemote when gitInfo.remote is absent', async () => {
      const project = makeProject({ gitInfo: { branch: 'main', baseRef: 'main' } } as any);
      dbMock.getProjectById.mockResolvedValue(project);

      const result = await service.getProjectSettings('proj-001');

      expect(result!.gitRemote).toBeUndefined();
    });

    it('throws when projectId is empty string', async () => {
      await expect(service.getProjectSettings('')).rejects.toThrow('projectId is required');
    });

    it('propagates database errors', async () => {
      dbMock.getProjectById.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.getProjectSettings('proj-001')).rejects.toThrow('DB connection lost');
    });
  });

  // -------------------------------------------------------------------------
  // updateProjectSettings
  // -------------------------------------------------------------------------

  describe('updateProjectSettings', () => {
    it('updates baseRef and returns updated ProjectSettings', async () => {
      const updatedProject = makeProject({
        gitInfo: { remote: 'origin', branch: 'main', baseRef: 'feature/new-base' },
      } as any);
      dbMock.updateProjectBaseRef.mockResolvedValue(updatedProject);

      const result = await service.updateProjectSettings('proj-001', {
        baseRef: 'feature/new-base',
      });

      expect(result).toEqual({
        projectId: 'proj-001',
        name: 'My Project',
        path: '/home/user/my-project',
        gitRemote: 'origin',
        gitBranch: 'main',
        baseRef: 'feature/new-base',
      });
      expect(dbMock.updateProjectBaseRef).toHaveBeenCalledWith('proj-001', 'feature/new-base');
    });

    it('throws when projectId is empty string', async () => {
      await expect(service.updateProjectSettings('', { baseRef: 'main' })).rejects.toThrow(
        'projectId is required'
      );
    });

    it('throws when baseRef is not provided (undefined)', async () => {
      await expect(service.updateProjectSettings('proj-001', {} as any)).rejects.toThrow(
        'baseRef is required'
      );
    });

    it('throws when baseRef is null', async () => {
      await expect(
        service.updateProjectSettings('proj-001', { baseRef: null as any })
      ).rejects.toThrow('baseRef is required');
    });

    it('throws "Project not found" when db returns null after update', async () => {
      dbMock.updateProjectBaseRef.mockResolvedValue(null);

      await expect(service.updateProjectSettings('proj-404', { baseRef: 'main' })).rejects.toThrow(
        'Project not found'
      );
    });

    it('accepts an empty string as a valid baseRef (clears the value)', async () => {
      const updatedProject = makeProject({
        gitInfo: { remote: 'origin', branch: 'main', baseRef: '' },
      } as any);
      dbMock.updateProjectBaseRef.mockResolvedValue(updatedProject);

      // Empty string IS a typeof string, so should pass validation
      const result = await service.updateProjectSettings('proj-001', { baseRef: '' });

      expect(result.baseRef).toBe('');
      expect(dbMock.updateProjectBaseRef).toHaveBeenCalledWith('proj-001', '');
    });

    it('propagates database errors during update', async () => {
      dbMock.updateProjectBaseRef.mockRejectedValue(new Error('write conflict'));

      await expect(service.updateProjectSettings('proj-001', { baseRef: 'main' })).rejects.toThrow(
        'write conflict'
      );
    });

    it('passes the projectId and baseRef to databaseService.updateProjectBaseRef', async () => {
      const project = makeProject({
        gitInfo: { remote: 'origin', branch: 'main', baseRef: 'HEAD~1' },
      } as any);
      dbMock.updateProjectBaseRef.mockResolvedValue(project);

      await service.updateProjectSettings('proj-abc', { baseRef: 'HEAD~1' });

      expect(dbMock.updateProjectBaseRef).toHaveBeenCalledTimes(1);
      expect(dbMock.updateProjectBaseRef).toHaveBeenCalledWith('proj-abc', 'HEAD~1');
    });
  });

  // -------------------------------------------------------------------------
  // toSettings (private — tested indirectly via getProjectSettings)
  // -------------------------------------------------------------------------

  describe('settings shape', () => {
    it('always includes projectId, name, path, gitRemote, gitBranch, baseRef keys', async () => {
      const project = makeProject();
      dbMock.getProjectById.mockResolvedValue(project);

      const result = await service.getProjectSettings('proj-001');

      expect(result).toHaveProperty('projectId');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('gitRemote');
      expect(result).toHaveProperty('gitBranch');
      expect(result).toHaveProperty('baseRef');
    });

    it('projectId in settings equals the project id from the database', async () => {
      const project = makeProject({ id: 'custom-proj-id' } as any);
      dbMock.getProjectById.mockResolvedValue(project);

      const result = await service.getProjectSettings('custom-proj-id');

      expect(result!.projectId).toBe('custom-proj-id');
    });
  });
});
