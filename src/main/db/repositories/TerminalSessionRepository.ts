import { asc, eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import { terminalSessions as terminalSessionsTable } from '../schema';
import type { TerminalSession } from '../types';

export class TerminalSessionRepository {
  constructor(private disabled: () => boolean) {}

  async getAll(taskKey: string): Promise<TerminalSession[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(terminalSessionsTable)
      .where(eq(terminalSessionsTable.taskKey, taskKey))
      .orderBy(asc(terminalSessionsTable.displayOrder));
    return rows.map((row) => ({
      id: row.id,
      taskKey: row.taskKey,
      terminalId: row.terminalId,
      title: row.title,
      cwd: row.cwd ?? null,
      isActive: row.isActive === 1,
      displayOrder: row.displayOrder ?? 0,
      createdAt: row.createdAt ?? new Date().toISOString(),
    }));
  }

  async save(taskKey: string, sessions: TerminalSession[]): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.transaction(async (tx) => {
      await tx.delete(terminalSessionsTable).where(eq(terminalSessionsTable.taskKey, taskKey));
      for (const session of sessions) {
        await tx.insert(terminalSessionsTable).values({
          id: session.id,
          taskKey,
          terminalId: session.terminalId,
          title: session.title,
          cwd: session.cwd ?? null,
          isActive: session.isActive ? 1 : 0,
          displayOrder: session.displayOrder,
        });
      }
    });
  }

  async delete(taskKey: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(terminalSessionsTable).where(eq(terminalSessionsTable.taskKey, taskKey));
  }
}
