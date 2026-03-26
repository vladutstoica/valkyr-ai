import { asc, desc, eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import { projects as projectsTable, type ProjectRow } from '../schema';
import type { Project, SubRepo } from '../types';
import { log } from '../../lib/logger';

// --- Base ref computation helpers ---

function defaultRemoteName(): string {
  return 'origin';
}

function defaultBranch(): string {
  return 'main';
}

function getRemoteAlias(remote?: string | null): string {
  if (!remote) return defaultRemoteName();
  const trimmed = remote.trim();
  if (!trimmed) return '';
  if (/^[A-Za-z0-9._-]+$/.test(trimmed) && !trimmed.includes('://')) {
    return trimmed;
  }
  return defaultRemoteName();
}

function computeBaseRef(
  preferred?: string | null,
  remote?: string | null,
  branch?: string | null
): string {
  const remoteName = getRemoteAlias(remote);
  const normalize = (value?: string | null): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('://')) return undefined;

    if (trimmed.includes('/')) {
      const [head, ...rest] = trimmed.split('/');
      const branchPart = rest.join('/').replace(/^\/+/, '');
      if (head && branchPart) return `${head}/${branchPart}`;
      if (!head && branchPart) {
        return remoteName ? `${remoteName}/${branchPart}` : branchPart;
      }
      return undefined;
    }

    const suffix = trimmed.replace(/^\/+/, '');
    return remoteName ? `${remoteName}/${suffix}` : suffix;
  };

  const def = remoteName ? `${remoteName}/${defaultBranch()}` : defaultBranch();
  return normalize(preferred) ?? normalize(branch) ?? def;
}

// --- Row mapper ---

function mapProjectRow(row: ProjectRow): Project {
  let subRepos: SubRepo[] | null = null;
  if (row.subRepos) {
    try {
      subRepos = JSON.parse(row.subRepos) as SubRepo[];
    } catch (e) {
      log.warn(`Failed to parse subRepos for project ${row.id}:`, e);
    }
  }

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    isRemote: row.isRemote === 1,
    sshConnectionId: row.sshConnectionId ?? null,
    remotePath: row.remotePath ?? null,
    subRepos,
    groupId: row.groupId ?? null,
    workspaceId: row.workspaceId ?? null,
    gitInfo: {
      isGitRepo: !!(row.gitRemote || row.gitBranch),
      remote: row.gitRemote ?? undefined,
      branch: row.gitBranch ?? undefined,
      baseRef: computeBaseRef(row.baseRef, row.gitRemote, row.gitBranch),
    },
    githubInfo: row.githubRepository
      ? { repository: row.githubRepository, connected: !!row.githubConnected }
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ProjectRepository {
  constructor(private disabled: () => boolean) {}

  async save(project: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const gitRemote = project.gitInfo.remote ?? null;
    const gitBranch = project.gitInfo.branch ?? null;
    const baseRef = computeBaseRef(project.gitInfo.baseRef, project.gitInfo.remote, project.gitInfo.branch);
    const githubRepository = project.githubInfo?.repository ?? null;
    const githubConnected = project.githubInfo?.connected ? 1 : 0;
    const subReposJson =
      project.subRepos && project.subRepos.length > 0 ? JSON.stringify(project.subRepos) : null;

    await db
      .insert(projectsTable)
      .values({
        id: project.id,
        name: project.name,
        path: project.path,
        gitRemote,
        gitBranch,
        baseRef: baseRef ?? null,
        githubRepository,
        githubConnected,
        sshConnectionId: project.sshConnectionId ?? null,
        isRemote: project.isRemote ? 1 : 0,
        remotePath: project.remotePath ?? null,
        subRepos: subReposJson,
        workspaceId: project.workspaceId ?? null,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: projectsTable.path,
        set: {
          name: project.name,
          gitRemote,
          gitBranch,
          baseRef: baseRef ?? null,
          githubRepository,
          githubConnected,
          sshConnectionId: project.sshConnectionId ?? null,
          isRemote: project.isRemote ? 1 : 0,
          remotePath: project.remotePath ?? null,
          subRepos: subReposJson,
          workspaceId: project.workspaceId ?? null,
          updatedAt: new Date().toISOString(),
        },
      });
  }

  async getAll(): Promise<Project[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(projectsTable)
      .orderBy(asc(projectsTable.displayOrder), desc(projectsTable.updatedAt));
    return rows.map(mapProjectRow);
  }

  async getById(projectId: string): Promise<Project | null> {
    if (this.disabled()) return null;
    if (!projectId) throw new Error('projectId is required');
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (rows.length === 0) return null;
    return mapProjectRow(rows[0]);
  }

  async updateOrder(projectIds: string[]): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await Promise.all(
        projectIds.map((id, i) =>
          tx.update(projectsTable).set({ displayOrder: i, updatedAt: now }).where(eq(projectsTable.id, id))
        )
      );
    });
  }

  async updateBaseRef(projectId: string, nextBaseRef: string): Promise<Project | null> {
    if (this.disabled()) return null;
    if (!projectId) throw new Error('projectId is required');
    const trimmed = typeof nextBaseRef === 'string' ? nextBaseRef.trim() : '';
    if (!trimmed) throw new Error('baseRef cannot be empty');

    const { db } = await getDrizzleClient();
    const rows = await db
      .select({ id: projectsTable.id, gitRemote: projectsTable.gitRemote, gitBranch: projectsTable.gitBranch })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (rows.length === 0) throw new Error(`Project not found: ${projectId}`);

    const source = rows[0];
    const normalized = computeBaseRef(trimmed, source.gitRemote, source.gitBranch);

    await db
      .update(projectsTable)
      .set({ baseRef: normalized, updatedAt: new Date().toISOString() })
      .where(eq(projectsTable.id, projectId));

    return this.getById(projectId);
  }

  async updateName(projectId: string, newName: string): Promise<Project | null> {
    if (this.disabled()) return null;
    if (!projectId) throw new Error('projectId is required');
    const trimmed = typeof newName === 'string' ? newName.trim() : '';
    if (!trimmed) throw new Error('name cannot be empty');

    const { db } = await getDrizzleClient();
    await db
      .update(projectsTable)
      .set({ name: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(projectsTable.id, projectId));

    return this.getById(projectId);
  }

  async delete(projectId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  }
}
