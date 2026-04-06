import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import { tasks as tasksTable, type TaskRow } from '../schema';
import type { Task } from '../types';

function parseTaskMetadata(serialized: string, taskId: string): any {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    console.warn(`Failed to parse task metadata for ${taskId}`, error);
    return null;
  }
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    branch: row.branch,
    path: row.path,
    status: (row.status as Task['status']) ?? 'idle',
    agentId: row.agentId ?? null,
    metadata:
      typeof row.metadata === 'string' && row.metadata.length > 0
        ? parseTaskMetadata(row.metadata, row.id)
        : null,
    useWorktree: row.useWorktree === 1,
    archivedAt: row.archivedAt ?? null,
    isPinned: row.isPinned === 1,
    lastAgent: row.lastAgent ?? null,
    lockedAgent: row.lockedAgent ?? null,
    initialPromptSent: row.initialPromptSent === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class TaskRepository {
  constructor(private disabled: () => boolean) {}

  async save(task: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (this.disabled()) return;
    const metadataValue =
      typeof task.metadata === 'string'
        ? task.metadata
        : task.metadata
          ? JSON.stringify(task.metadata)
          : null;
    const { db } = await getDrizzleClient();
    await db
      .insert(tasksTable)
      .values({
        id: task.id,
        projectId: task.projectId,
        name: task.name,
        branch: task.branch,
        path: task.path,
        status: task.status,
        agentId: task.agentId ?? null,
        metadata: metadataValue,
        useWorktree: task.useWorktree !== false ? 1 : 0,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: tasksTable.id,
        set: {
          projectId: task.projectId,
          name: task.name,
          branch: task.branch,
          path: task.path,
          status: task.status,
          agentId: task.agentId ?? null,
          metadata: metadataValue,
          useWorktree: task.useWorktree !== false ? 1 : 0,
          updatedAt: new Date().toISOString(),
        },
      });
  }

  async getAll(projectId?: string): Promise<Task[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows: TaskRow[] = projectId
      ? await db
          .select()
          .from(tasksTable)
          .where(and(eq(tasksTable.projectId, projectId), isNull(tasksTable.archivedAt)))
          .orderBy(desc(tasksTable.updatedAt))
      : await db
          .select()
          .from(tasksTable)
          .where(isNull(tasksTable.archivedAt))
          .orderBy(desc(tasksTable.updatedAt));
    return rows.map(mapTaskRow);
  }

  async getArchived(projectId?: string): Promise<Task[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows: TaskRow[] = projectId
      ? await db
          .select()
          .from(tasksTable)
          .where(
            and(eq(tasksTable.projectId, projectId), sql`${tasksTable.archivedAt} IS NOT NULL`)
          )
          .orderBy(desc(tasksTable.archivedAt))
      : await db
          .select()
          .from(tasksTable)
          .where(sql`${tasksTable.archivedAt} IS NOT NULL`)
          .orderBy(desc(tasksTable.archivedAt));
    return rows.map(mapTaskRow);
  }

  async archive(taskId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(tasksTable)
      .set({
        archivedAt: new Date().toISOString(),
        status: 'idle',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tasksTable.id, taskId));
  }

  async restore(taskId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(tasksTable)
      .set({ archivedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, taskId));
  }

  async getByPath(taskPath: string): Promise<Task | null> {
    if (this.disabled()) return null;
    const { db } = await getDrizzleClient();
    const rows = await db.select().from(tasksTable).where(eq(tasksTable.path, taskPath)).limit(1);
    if (rows.length === 0) return null;
    return mapTaskRow(rows[0]);
  }

  async delete(taskId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(tasksTable).where(eq(tasksTable.id, taskId));
  }

  async setPinned(taskId: string, pinned: boolean): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(tasksTable)
      .set({ isPinned: pinned ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, taskId));
  }

  async getPinnedIds(): Promise<string[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(eq(tasksTable.isPinned, 1));
    return rows.map((r) => r.id);
  }

  async setAgent(
    taskId: string,
    update: { lastAgent?: string | null; lockedAgent?: string | null }
  ): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if ('lastAgent' in update) set.lastAgent = update.lastAgent ?? null;
    if ('lockedAgent' in update) set.lockedAgent = update.lockedAgent ?? null;
    await db.update(tasksTable).set(set).where(eq(tasksTable.id, taskId));
  }

  async setInitialPromptSent(taskId: string, sent: boolean): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(tasksTable)
      .set({ initialPromptSent: sent ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, taskId));
  }
}
