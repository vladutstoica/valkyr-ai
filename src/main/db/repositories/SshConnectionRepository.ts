import { eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import {
  sshConnections as sshConnectionsTable,
  type SshConnectionRow,
  type SshConnectionInsert,
} from '../schema';

export class SshConnectionRepository {
  constructor(private disabled: () => boolean) {}

  async save(
    connection: Omit<SshConnectionInsert, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<SshConnectionRow> {
    if (this.disabled()) {
      throw new Error('Database is disabled');
    }
    const { db } = await getDrizzleClient();
    const id = connection.id ?? `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const result = await db
      .insert(sshConnectionsTable)
      .values({
        ...connection,
        id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sshConnectionsTable.id,
        set: {
          name: connection.name,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          authType: connection.authType,
          privateKeyPath: connection.privateKeyPath ?? null,
          useAgent: connection.useAgent,
          updatedAt: now,
        },
      })
      .returning();
    return result[0];
  }

  async getAll(): Promise<SshConnectionRow[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    return db.select().from(sshConnectionsTable).orderBy(sshConnectionsTable.name);
  }

  async getById(id: string): Promise<SshConnectionRow | null> {
    if (this.disabled()) return null;
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(sshConnectionsTable)
      .where(eq(sshConnectionsTable.id, id))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(sshConnectionsTable).where(eq(sshConnectionsTable.id, id));
  }
}
