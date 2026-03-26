import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import {
  lineComments as lineCommentsTable,
  type LineCommentRow,
  type LineCommentInsert,
} from '../schema';

export class LineCommentRepository {
  constructor(private disabled: () => boolean) {}

  async save(input: Omit<LineCommentInsert, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    if (this.disabled()) return '';
    const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { db } = await getDrizzleClient();
    await db.insert(lineCommentsTable).values({
      id,
      taskId: input.taskId,
      filePath: input.filePath,
      lineNumber: input.lineNumber,
      lineContent: input.lineContent ?? null,
      content: input.content,
      updatedAt: new Date().toISOString(),
    });
    return id;
  }

  async getAll(taskId: string, filePath?: string): Promise<LineCommentRow[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();

    if (filePath) {
      return db
        .select()
        .from(lineCommentsTable)
        .where(
          sql`${lineCommentsTable.taskId} = ${taskId} AND ${lineCommentsTable.filePath} = ${filePath}`
        )
        .orderBy(asc(lineCommentsTable.lineNumber));
    }

    return db
      .select()
      .from(lineCommentsTable)
      .where(eq(lineCommentsTable.taskId, taskId))
      .orderBy(asc(lineCommentsTable.lineNumber));
  }

  async update(id: string, content: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(lineCommentsTable)
      .set({ content, updatedAt: new Date().toISOString() })
      .where(eq(lineCommentsTable.id, id));
  }

  async delete(id: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(lineCommentsTable).where(eq(lineCommentsTable.id, id));
  }

  async markSent(commentIds: string[]): Promise<void> {
    if (this.disabled() || commentIds.length === 0) return;
    const { db } = await getDrizzleClient();
    await db
      .update(lineCommentsTable)
      .set({ sentAt: new Date().toISOString() })
      .where(inArray(lineCommentsTable.id, commentIds));
  }

  async getUnsent(taskId: string): Promise<LineCommentRow[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    return db
      .select()
      .from(lineCommentsTable)
      .where(and(eq(lineCommentsTable.taskId, taskId), isNull(lineCommentsTable.sentAt)))
      .orderBy(asc(lineCommentsTable.filePath), asc(lineCommentsTable.lineNumber));
  }
}
