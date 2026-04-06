import { eq } from 'drizzle-orm';
import { getDrizzleClient } from '../drizzleClient';
import { appState as appStateTable } from '../schema';
import type { AppState } from '../types';

const DEFAULT_STATE: AppState = {
  activeProjectId: null,
  activeTaskId: null,
  activeWorkspaceId: null,
  prMode: null,
  prDraft: false,
};

export class AppStateRepository {
  constructor(private disabled: () => boolean) {}

  async get(): Promise<AppState> {
    if (this.disabled()) return { ...DEFAULT_STATE };
    const { db } = await getDrizzleClient();
    const rows = await db.select().from(appStateTable).where(eq(appStateTable.id, 1)).limit(1);
    if (rows.length === 0) {
      await db.insert(appStateTable).values({ id: 1 }).onConflictDoNothing();
      return { ...DEFAULT_STATE };
    }
    const row = rows[0];
    return {
      activeProjectId: row.activeProjectId ?? null,
      activeTaskId: row.activeTaskId ?? null,
      activeWorkspaceId: row.activeWorkspaceId ?? null,
      prMode: row.prMode ?? null,
      prDraft: row.prDraft === 1,
    };
  }

  async update(partial: Partial<AppState>): Promise<void> {
    if (this.disabled()) return;
    const { db } = await getDrizzleClient();
    const set: Record<string, unknown> = {};
    if ('activeProjectId' in partial) set.activeProjectId = partial.activeProjectId ?? null;
    if ('activeTaskId' in partial) set.activeTaskId = partial.activeTaskId ?? null;
    if ('activeWorkspaceId' in partial) set.activeWorkspaceId = partial.activeWorkspaceId ?? null;
    if ('prMode' in partial) set.prMode = partial.prMode ?? null;
    if ('prDraft' in partial) set.prDraft = partial.prDraft ? 1 : 0;
    if (Object.keys(set).length === 0) return;
    await db
      .insert(appStateTable)
      .values({ id: 1, ...set })
      .onConflictDoUpdate({
        target: appStateTable.id,
        set,
      });
  }
}
