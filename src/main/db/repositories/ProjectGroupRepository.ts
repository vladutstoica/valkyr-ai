import { asc, desc, eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import {
  projectGroups as projectGroupsTable,
  projects as projectsTable,
  type ProjectGroupRow,
} from '../schema';
import type { ProjectGroup } from '../types';

function mapGroupRow(row: ProjectGroupRow): ProjectGroup {
  return {
    id: row.id,
    name: row.name,
    displayOrder: row.displayOrder,
    isCollapsed: row.isCollapsed === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ProjectGroupRepository {
  constructor(private disabled: () => boolean) {}

  async getAll(): Promise<ProjectGroup[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(projectGroupsTable)
      .orderBy(asc(projectGroupsTable.displayOrder));
    return rows.map(mapGroupRow);
  }

  async create(name: string): Promise<ProjectGroup> {
    if (this.disabled()) throw new Error('Database is disabled');
    const { db } = await getDrizzleClient();

    const existing = await db
      .select()
      .from(projectGroupsTable)
      .orderBy(desc(projectGroupsTable.displayOrder))
      .limit(1);
    const maxOrder = existing.length > 0 ? existing[0].displayOrder : -1;

    const id = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(projectGroupsTable).values({
      id,
      name,
      displayOrder: maxOrder + 1,
    });

    const [row] = await db
      .select()
      .from(projectGroupsTable)
      .where(eq(projectGroupsTable.id, id))
      .limit(1);
    return mapGroupRow(row);
  }

  async rename(id: string, name: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(projectGroupsTable)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(projectGroupsTable.id, id));
  }

  async delete(id: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(projectGroupsTable).where(eq(projectGroupsTable.id, id));
  }

  async updateOrder(groupIds: string[]): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await Promise.all(
        groupIds.map((id, i) =>
          tx
            .update(projectGroupsTable)
            .set({ displayOrder: i, updatedAt: now })
            .where(eq(projectGroupsTable.id, id))
        )
      );
    });
  }

  async setProjectGroup(projectId: string, groupId: string | null): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(projectsTable)
      .set({ groupId, updatedAt: new Date().toISOString() })
      .where(eq(projectsTable.id, projectId));
  }

  async toggleCollapsed(id: string, isCollapsed: boolean): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(projectGroupsTable)
      .set({ isCollapsed: isCollapsed ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(projectGroupsTable.id, id));
  }
}
