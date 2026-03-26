import { and, asc, desc, eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import {
  conversations as conversationsTable,
  messages as messagesTable,
  type ConversationRow,
  type MessageRow,
} from '../schema';
import type { Conversation, Message } from '../types';

function mapConversationRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    provider: row.provider ?? null,
    mode: (row.mode as 'pty' | 'acp') ?? 'pty',
    acpSessionId: row.acpSessionId ?? null,
    isActive: row.isActive === 1,
    isMain: row.isMain !== undefined ? row.isMain === 1 : true,
    displayOrder: row.displayOrder ?? 0,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    content: row.content,
    sender: row.sender as Message['sender'],
    parts: row.parts ?? null,
    timestamp: row.timestamp,
    metadata: row.metadata ?? undefined,
  };
}

export class ConversationRepository {
  constructor(private disabled: () => boolean) {}

  async save(conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .insert(conversationsTable)
      .values({
        id: conversation.id,
        taskId: conversation.taskId,
        title: conversation.title,
        provider: conversation.provider ?? null,
        isActive: conversation.isActive ? 1 : 0,
        isMain: conversation.isMain ? 1 : 0,
        displayOrder: conversation.displayOrder ?? 0,
        metadata: conversation.metadata ?? null,
        mode: conversation.mode ?? 'pty',
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: conversationsTable.id,
        set: {
          title: conversation.title,
          provider: conversation.provider ?? null,
          isActive: conversation.isActive ? 1 : 0,
          isMain: conversation.isMain ? 1 : 0,
          displayOrder: conversation.displayOrder ?? 0,
          metadata: conversation.metadata ?? null,
          mode: conversation.mode ?? 'pty',
          updatedAt: new Date().toISOString(),
        },
      });
  }

  async getAll(taskId: string): Promise<Conversation[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.taskId, taskId))
      .orderBy(asc(conversationsTable.displayOrder), desc(conversationsTable.updatedAt));
    return rows.map(mapConversationRow);
  }

  async getOrCreateDefault(taskId: string): Promise<Conversation> {
    if (this.disabled()) {
      return {
        id: `conv-${taskId}-default`,
        taskId,
        title: 'Default Conversation',
        isMain: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const { db } = await getDrizzleClient();
    const existingRows = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.taskId, taskId))
      .orderBy(asc(conversationsTable.createdAt))
      .limit(1);

    if (existingRows.length > 0) {
      return mapConversationRow(existingRows[0]);
    }

    const conversationId = `conv-${taskId}-${Date.now()}`;
    await this.save({
      id: conversationId,
      taskId,
      title: 'Default Conversation',
      isMain: true,
    });

    const [createdRow] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (createdRow) {
      return mapConversationRow(createdRow);
    }

    return {
      id: conversationId,
      taskId,
      title: 'Default Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async create(
    taskId: string,
    title: string,
    provider?: string,
    isMain?: boolean,
    mode?: 'pty' | 'acp',
    metadata?: string | null
  ): Promise<Conversation> {
    if (this.disabled()) {
      return {
        id: `conv-${taskId}-${Date.now()}`,
        taskId,
        title,
        provider: provider ?? null,
        isActive: true,
        isMain: isMain ?? false,
        displayOrder: 0,
        metadata: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const { db } = await getDrizzleClient();
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.transaction(async (tx) => {
      const existingConversations = await tx
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.taskId, taskId));

      const maxOrder = Math.max(...existingConversations.map((c) => c.displayOrder || 0), -1);

      let shouldBeMain = isMain;
      if (shouldBeMain === true) {
        const hasMain = existingConversations.some((c) => c.isMain === 1);
        if (hasMain) shouldBeMain = false;
      } else if (shouldBeMain === undefined) {
        shouldBeMain = existingConversations.length === 0;
      }

      await tx
        .update(conversationsTable)
        .set({ isActive: 0 })
        .where(eq(conversationsTable.taskId, taskId));

      await tx.insert(conversationsTable).values({
        id: conversationId,
        taskId,
        title,
        provider: provider ?? null,
        isActive: 1,
        isMain: (shouldBeMain ?? false) ? 1 : 0,
        displayOrder: maxOrder + 1,
        mode: mode ?? 'pty',
        metadata: metadata ?? null,
      });
    });

    const [createdRow] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    return mapConversationRow(createdRow);
  }

  async setActive(taskId: string, conversationId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.transaction(async (tx) => {
      await tx
        .update(conversationsTable)
        .set({ isActive: 0 })
        .where(eq(conversationsTable.taskId, taskId));
      await tx
        .update(conversationsTable)
        .set({ isActive: 1, updatedAt: new Date().toISOString() })
        .where(eq(conversationsTable.id, conversationId));
    });
  }

  async getActive(taskId: string): Promise<Conversation | null> {
    if (this.disabled()) return null;
    const { db } = await getDrizzleClient();
    const results = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.taskId, taskId), eq(conversationsTable.isActive, 1)))
      .limit(1);
    return results[0] ? mapConversationRow(results[0]) : null;
  }

  async reorder(taskId: string, conversationIds: string[]): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.transaction(async (tx) => {
      await Promise.all(
        conversationIds.map((id, i) =>
          tx
            .update(conversationsTable)
            .set({ displayOrder: i })
            .where(eq(conversationsTable.id, id))
        )
      );
    });
  }

  async updateAcpSessionId(conversationId: string, acpSessionId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(conversationsTable)
      .set({ acpSessionId, updatedAt: new Date().toISOString() })
      .where(eq(conversationsTable.id, conversationId));
  }

  async getAcpSessionId(conversationId: string): Promise<string | null> {
    if (this.disabled()) return null;
    const { db } = await getDrizzleClient();
    const rows = await db
      .select({ acpSessionId: conversationsTable.acpSessionId })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);
    return rows[0]?.acpSessionId ?? null;
  }

  async updateTitle(conversationId: string, title: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db
      .update(conversationsTable)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(conversationsTable.id, conversationId));
  }

  async delete(conversationId: string): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    await db.delete(conversationsTable).where(eq(conversationsTable.id, conversationId));
  }

  // Message methods
  async saveMessage(message: Omit<Message, 'timestamp'>): Promise<void> {
    if (this.disabled()) return;
    const metadataValue =
      typeof message.metadata === 'string'
        ? message.metadata
        : message.metadata
          ? JSON.stringify(message.metadata)
          : null;
    const { db } = await getDrizzleClient();
    await db.transaction(async (tx) => {
      await tx
        .insert(messagesTable)
        .values({
          id: message.id,
          conversationId: message.conversationId,
          content: message.content,
          sender: message.sender,
          parts: message.parts ?? null,
          metadata: metadataValue,
          timestamp: new Date().toISOString(),
        })
        .onConflictDoNothing()
        .run();
      await tx
        .update(conversationsTable)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(conversationsTable.id, message.conversationId))
        .run();
    });
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    if (this.disabled()) return [];
    const { db } = await getDrizzleClient();
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.timestamp));
    return rows.map(mapMessageRow);
  }
}
