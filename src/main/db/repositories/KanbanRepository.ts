import { getDrizzleClient } from '../drizzleClient';
import { kanbanColumns as kanbanColumnsTable } from '../schema';

export class KanbanRepository {
  constructor(private disabled: () => boolean) {}

  async getStatuses(): Promise<Array<{ taskId: string; status: string }>> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db.select().from(kanbanColumnsTable);
    return rows.map((row) => ({ taskId: row.taskId, status: row.status }));
  }

  async setStatus(taskId: string, status: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.insert(kanbanColumnsTable).values({ id: taskId, taskId, status }).onConflictDoUpdate({
      target: kanbanColumnsTable.id,
      set: { status },
    });
  }
}
