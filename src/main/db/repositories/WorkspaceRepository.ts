import { asc, desc, eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import {
  workspaces as workspacesTable,
  projects as projectsTable,
  type WorkspaceRow,
} from '../schema';
import type { Workspace } from '../types';

function mapWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    emoji: row.emoji,
    displayOrder: row.displayOrder,
    isDefault: row.isDefault === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class WorkspaceRepository {
  constructor(private disabled: () => boolean) {}

  async ensureDefault(): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const existing = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.isDefault, 1))
      .limit(1);
    if (existing.length > 0) return;

    const id = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(workspacesTable).values({
      id,
      name: 'Default',
      color: 'blue',
      displayOrder: 0,
      isDefault: 1,
    });
  }

  async getAll(): Promise<Workspace[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db.select().from(workspacesTable).orderBy(asc(workspacesTable.displayOrder));
    return rows.map(mapWorkspaceRow);
  }

  async create(name: string, color: string = 'blue'): Promise<Workspace> {
    if (this.disabled()) throw new Error('Database is disabled');
    const { db } = await getDrizzleClient();

    const existing = await db
      .select()
      .from(workspacesTable)
      .orderBy(desc(workspacesTable.displayOrder))
      .limit(1);
    const maxOrder = existing.length > 0 ? existing[0].displayOrder : -1;

    const id = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(workspacesTable).values({
      id,
      name,
      color,
      displayOrder: maxOrder + 1,
    });

    const [row] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, id))
      .limit(1);
    return mapWorkspaceRow(row);
  }

  async rename(id: string, name: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(workspacesTable)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(workspacesTable.id, id));
  }

  async updateColor(id: string, color: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(workspacesTable)
      .set({ color, updatedAt: new Date().toISOString() })
      .where(eq(workspacesTable.id, id));
  }

  async updateEmoji(id: string, emoji: string | null): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(workspacesTable)
      .set({ emoji, updatedAt: new Date().toISOString() })
      .where(eq(workspacesTable.id, id));
  }

  async delete(id: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();

    await db.transaction(async (tx) => {
      const [ws] = await tx
        .select()
        .from(workspacesTable)
        .where(eq(workspacesTable.id, id))
        .limit(1);
      if (!ws) return;
      if (ws.isDefault === 1) throw new Error('Cannot delete the default workspace');

      const [defaultWs] = await tx
        .select()
        .from(workspacesTable)
        .where(eq(workspacesTable.isDefault, 1))
        .limit(1);

      if (defaultWs) {
        await tx
          .update(projectsTable)
          .set({ workspaceId: defaultWs.id, updatedAt: new Date().toISOString() })
          .where(eq(projectsTable.workspaceId, id));
      }

      await tx.delete(workspacesTable).where(eq(workspacesTable.id, id));
    });
  }

  async updateOrder(workspaceIds: string[]): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await Promise.all(
        workspaceIds.map((id, i) =>
          tx
            .update(workspacesTable)
            .set({ displayOrder: i, updatedAt: now })
            .where(eq(workspacesTable.id, id))
        )
      );
    });
  }

  async setProjectWorkspace(projectId: string, workspaceId: string | null): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(projectsTable)
      .set({ workspaceId, updatedAt: new Date().toISOString() })
      .where(eq(projectsTable.id, projectId));
  }
}
