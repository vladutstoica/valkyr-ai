import type sqlite3Type from 'sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { resolveDatabasePath, resolveMigrationsPath } from '../db/path';
import { getDrizzleClient, resetDrizzleClient } from '../db/drizzleClient';
import { errorTracking } from '../errorTracking';
import { log } from '../lib/logger';
import {
  type LineCommentRow,
  type LineCommentInsert,
  type SshConnectionRow,
  type SshConnectionInsert,
} from '../db/schema';

// Re-export domain types from canonical location for backward compatibility
export type {
  SubRepoGitInfo,
  SubRepo,
  ProjectGroup,
  Workspace,
  Project,
  Task,
  Conversation,
  Message,
  MigrationSummary,
  AppState,
  TerminalSession,
} from '../db/types';

import type {
  SubRepo,
  ProjectGroup,
  Workspace,
  Project,
  Task,
  Conversation,
  Message,
  MigrationSummary,
  AppState,
  TerminalSession,
} from '../db/types';
import { AppStateRepository } from '../db/repositories/AppStateRepository';
import { TerminalSessionRepository } from '../db/repositories/TerminalSessionRepository';
import { KanbanRepository } from '../db/repositories/KanbanRepository';
import { SshConnectionRepository } from '../db/repositories/SshConnectionRepository';
import { ConversationRepository } from '../db/repositories/ConversationRepository';
import { ProjectRepository } from '../db/repositories/ProjectRepository';
import { TaskRepository } from '../db/repositories/TaskRepository';
import { LineCommentRepository } from '../db/repositories/LineCommentRepository';
import { ProjectGroupRepository } from '../db/repositories/ProjectGroupRepository';
import { WorkspaceRepository } from '../db/repositories/WorkspaceRepository';

export class DatabaseService {
  private static migrationsApplied = false;
  private db: sqlite3Type.Database | null = null;
  private sqlite3: typeof sqlite3Type | null = null;
  private dbPath: string;
  private disabled: boolean = false;
  private lastMigrationSummary: MigrationSummary | null = null;

  // Repositories
  private readonly appStateRepo = new AppStateRepository(() => this.disabled);
  private readonly terminalSessionRepo = new TerminalSessionRepository(() => this.disabled);
  private readonly kanbanRepo = new KanbanRepository(() => this.disabled);
  private readonly sshConnectionRepo = new SshConnectionRepository(() => this.disabled);
  private readonly conversationRepo = new ConversationRepository(() => this.disabled);
  private readonly projectRepo = new ProjectRepository(() => this.disabled);
  private readonly taskRepo = new TaskRepository(() => this.disabled);
  private readonly lineCommentRepo = new LineCommentRepository(() => this.disabled);
  private readonly projectGroupRepo = new ProjectGroupRepository(() => this.disabled);
  private readonly workspaceRepo = new WorkspaceRepository(() => this.disabled);

  constructor() {
    if (process.env.VALKYR_DISABLE_NATIVE_DB === '1') {
      this.disabled = true;
    }
    this.dbPath = resolveDatabasePath();
  }

  async initialize(): Promise<void> {
    if (this.disabled) return Promise.resolve();
    if (!this.sqlite3) {
      try {
        // Dynamic import to avoid loading native module at startup
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.sqlite3 = (await import('sqlite3')) as unknown as typeof sqlite3Type;
      } catch (e) {
        // Track critical database initialization error
        await errorTracking.captureDatabaseError(e, 'initialize_sqlite3_import');
        return Promise.reject(e);
      }
    }
    return new Promise((resolve, reject) => {
      this.db = new this.sqlite3!.Database(this.dbPath, async (err) => {
        if (err) {
          // Track critical database connection error
          await errorTracking.captureDatabaseError(err, 'initialize_connection', {
            db_path: this.dbPath,
          });
          reject(err);
          return;
        }

        this.ensureMigrations()
          .then(() => this.ensureDefaultWorkspace())
          .then(() => resolve())
          .catch(async (migrationError) => {
            // Close the database connection on migration failure to prevent leaks
            if (this.db) {
              try {
                this.db.close(() => {});
              } catch {}
              this.db = null;
            }
            // Track critical migration error
            await errorTracking.captureDatabaseError(migrationError, 'initialize_migrations');
            reject(migrationError);
          });
      });
    });
  }

  getLastMigrationSummary(): MigrationSummary | null {
    return this.lastMigrationSummary;
  }

  // Project methods (delegated to ProjectRepository)
  async saveProject(project: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<void> {
    return this.projectRepo.save(project);
  }

  async getProjects(): Promise<Project[]> {
    return this.projectRepo.getAll();
  }

  async updateProjectOrder(projectIds: string[]): Promise<void> {
    return this.projectRepo.updateOrder(projectIds);
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    return this.projectRepo.getById(projectId);
  }

  async updateProjectBaseRef(projectId: string, nextBaseRef: string): Promise<Project | null> {
    return this.projectRepo.updateBaseRef(projectId, nextBaseRef);
  }

  async updateProjectName(projectId: string, newName: string): Promise<Project | null> {
    return this.projectRepo.updateName(projectId, newName);
  }

  // Task methods (delegated to TaskRepository)
  async saveTask(task: Omit<Task, 'createdAt' | 'updatedAt'>): Promise<void> {
    return this.taskRepo.save(task);
  }

  async getTasks(projectId?: string): Promise<Task[]> {
    return this.taskRepo.getAll(projectId);
  }

  async getArchivedTasks(projectId?: string): Promise<Task[]> {
    return this.taskRepo.getArchived(projectId);
  }

  async archiveTask(taskId: string): Promise<void> {
    return this.taskRepo.archive(taskId);
  }

  async restoreTask(taskId: string): Promise<void> {
    return this.taskRepo.restore(taskId);
  }

  async getTaskByPath(taskPath: string): Promise<Task | null> {
    return this.taskRepo.getByPath(taskPath);
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.projectRepo.delete(projectId);
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.taskRepo.delete(taskId);
  }

  // Conversation management methods
  // Conversation methods (delegated to ConversationRepository)
  async saveConversation(conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<void> {
    return this.conversationRepo.save(conversation);
  }

  async getConversations(taskId: string): Promise<Conversation[]> {
    return this.conversationRepo.getAll(taskId);
  }

  async getOrCreateDefaultConversation(taskId: string): Promise<Conversation> {
    return this.conversationRepo.getOrCreateDefault(taskId);
  }

  async saveMessage(message: Omit<Message, 'timestamp'>): Promise<void> {
    return this.conversationRepo.saveMessage(message);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.conversationRepo.getMessages(conversationId);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.conversationRepo.delete(conversationId);
  }

  async createConversation(
    taskId: string,
    title: string,
    provider?: string,
    isMain?: boolean,
    mode?: 'pty' | 'acp',
    metadata?: string | null
  ): Promise<Conversation> {
    return this.conversationRepo.create(taskId, title, provider, isMain, mode, metadata);
  }

  async setActiveConversation(taskId: string, conversationId: string): Promise<void> {
    return this.conversationRepo.setActive(taskId, conversationId);
  }

  async getActiveConversation(taskId: string): Promise<Conversation | null> {
    return this.conversationRepo.getActive(taskId);
  }

  async reorderConversations(taskId: string, conversationIds: string[]): Promise<void> {
    return this.conversationRepo.reorder(taskId, conversationIds);
  }

  async updateConversationAcpSessionId(conversationId: string, acpSessionId: string): Promise<void> {
    return this.conversationRepo.updateAcpSessionId(conversationId, acpSessionId);
  }

  async getConversationAcpSessionId(conversationId: string): Promise<string | null> {
    return this.conversationRepo.getAcpSessionId(conversationId);
  }

  async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    return this.conversationRepo.updateTitle(conversationId, title);
  }

  // Line comment management methods
  // Line comment methods (delegated to LineCommentRepository)
  async saveLineComment(
    input: Omit<LineCommentInsert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    return this.lineCommentRepo.save(input);
  }

  async getLineComments(taskId: string, filePath?: string): Promise<LineCommentRow[]> {
    return this.lineCommentRepo.getAll(taskId, filePath);
  }

  async updateLineComment(id: string, content: string): Promise<void> {
    return this.lineCommentRepo.update(id, content);
  }

  async deleteLineComment(id: string): Promise<void> {
    return this.lineCommentRepo.delete(id);
  }

  async markCommentsSent(commentIds: string[]): Promise<void> {
    return this.lineCommentRepo.markSent(commentIds);
  }

  async getUnsentComments(taskId: string): Promise<LineCommentRow[]> {
    return this.lineCommentRepo.getUnsent(taskId);
  }

  // Project group methods (delegated to ProjectGroupRepository)
  async getProjectGroups(): Promise<ProjectGroup[]> {
    return this.projectGroupRepo.getAll();
  }

  async createProjectGroup(name: string): Promise<ProjectGroup> {
    return this.projectGroupRepo.create(name);
  }

  async renameProjectGroup(id: string, name: string): Promise<void> {
    return this.projectGroupRepo.rename(id, name);
  }

  async deleteProjectGroup(id: string): Promise<void> {
    return this.projectGroupRepo.delete(id);
  }

  async updateProjectGroupOrder(groupIds: string[]): Promise<void> {
    return this.projectGroupRepo.updateOrder(groupIds);
  }

  async setProjectGroup(projectId: string, groupId: string | null): Promise<void> {
    return this.projectGroupRepo.setProjectGroup(projectId, groupId);
  }

  async toggleProjectGroupCollapsed(id: string, isCollapsed: boolean): Promise<void> {
    return this.projectGroupRepo.toggleCollapsed(id, isCollapsed);
  }

  // Workspace methods (delegated to WorkspaceRepository)
  async ensureDefaultWorkspace(): Promise<void> {
    return this.workspaceRepo.ensureDefault();
  }

  async getWorkspaces(): Promise<Workspace[]> {
    return this.workspaceRepo.getAll();
  }

  async createWorkspace(name: string, color: string = 'blue'): Promise<Workspace> {
    return this.workspaceRepo.create(name, color);
  }

  async renameWorkspace(id: string, name: string): Promise<void> {
    return this.workspaceRepo.rename(id, name);
  }

  async updateWorkspaceColor(id: string, color: string): Promise<void> {
    return this.workspaceRepo.updateColor(id, color);
  }

  async updateWorkspaceEmoji(id: string, emoji: string | null): Promise<void> {
    return this.workspaceRepo.updateEmoji(id, emoji);
  }

  async deleteWorkspace(id: string): Promise<void> {
    return this.workspaceRepo.delete(id);
  }

  async updateWorkspaceOrder(workspaceIds: string[]): Promise<void> {
    return this.workspaceRepo.updateOrder(workspaceIds);
  }

  async setProjectWorkspace(projectId: string, workspaceId: string | null): Promise<void> {
    return this.workspaceRepo.setProjectWorkspace(projectId, workspaceId);
  }

  // SSH connection methods (delegated to SshConnectionRepository)
  async saveSshConnection(
    connection: Omit<SshConnectionInsert, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<SshConnectionRow> {
    return this.sshConnectionRepo.save(connection);
  }

  async getSshConnections(): Promise<SshConnectionRow[]> {
    return this.sshConnectionRepo.getAll();
  }

  async getSshConnection(id: string): Promise<SshConnectionRow | null> {
    return this.sshConnectionRepo.getById(id);
  }

  async deleteSshConnection(id: string): Promise<void> {
    return this.sshConnectionRepo.delete(id);
  }

  // App state methods (delegated to AppStateRepository)
  async getAppState(): Promise<AppState> {
    return this.appStateRepo.get();
  }

  async updateAppState(partial: Partial<AppState>): Promise<void> {
    return this.appStateRepo.update(partial);
  }

  // Task pinned/agent methods (delegated to TaskRepository)
  async setTaskPinned(taskId: string, pinned: boolean): Promise<void> {
    return this.taskRepo.setPinned(taskId, pinned);
  }

  async getPinnedTaskIds(): Promise<string[]> {
    return this.taskRepo.getPinnedIds();
  }

  async setTaskAgent(
    taskId: string,
    update: { lastAgent?: string | null; lockedAgent?: string | null }
  ): Promise<void> {
    return this.taskRepo.setAgent(taskId, update);
  }

  async setTaskInitialPromptSent(taskId: string, sent: boolean): Promise<void> {
    return this.taskRepo.setInitialPromptSent(taskId, sent);
  }

  // Terminal sessions methods (delegated to TerminalSessionRepository)
  async getTerminalSessions(taskKey: string): Promise<TerminalSession[]> {
    return this.terminalSessionRepo.getAll(taskKey);
  }

  async saveTerminalSessions(taskKey: string, sessions: TerminalSession[]): Promise<void> {
    return this.terminalSessionRepo.save(taskKey, sessions);
  }

  async deleteTerminalSessions(taskKey: string): Promise<void> {
    return this.terminalSessionRepo.delete(taskKey);
  }

  // Kanban methods (delegated to KanbanRepository)
  async getKanbanStatuses(): Promise<Array<{ taskId: string; status: string }>> {
    return this.kanbanRepo.getStatuses();
  }

  async setKanbanStatus(taskId: string, status: string): Promise<void> {
    return this.kanbanRepo.setStatus(taskId, status);
  }

  async close(): Promise<void> {
    if (this.disabled || !this.db) return;

    await new Promise<void>((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.db = null;
    await resetDrizzleClient();
  }

  private async ensureMigrations(): Promise<void> {
    if (this.disabled) return;
    if (!this.db) throw new Error('Database not initialized');
    if (DatabaseService.migrationsApplied) return;

    const migrationsPath = resolveMigrationsPath();
    if (!migrationsPath) {
      // Provide a detailed error message for debugging
      const errorMsg = [
        'Failed to locate database migrations folder.',
        'This can happen when:',
        '1. The app was installed via Homebrew (try downloading directly from GitHub)',
        '2. The app is running from Downloads/DMG (move it to Applications)',
        '3. The installation is incomplete or corrupted',
        '4. Security software is blocking file access',
        '',
        'To fix: Try downloading and installing Valkyr directly from:',
        'https://github.com/generalaction/valkyr/releases',
        '',
      ].join('\n');

      throw new Error(errorMsg);
    }

    // We run schema migrations with foreign_keys disabled.
    // Many dev DBs were created with foreign_keys=OFF, so legacy data can contain orphans.
    // Enabling FK enforcement mid-migration can cause schema transitions (table rebuilds) to fail.
    await this.execSql('PRAGMA foreign_keys=OFF;');
    try {
      // IMPORTANT:
      // Drizzle's built-in migrator for sqlite-proxy decides what to run based on the latest
      // `created_at` timestamp in __drizzle_migrations. If a migration is added later but has an
      // earlier timestamp than the latest applied migration, Drizzle will skip it forever.
      //
      // To make migrations robust for dev DBs (and for any DB that may have extra migrations),
      // we apply migrations by missing hash instead of timestamp ordering.
      const migrations = readMigrationFiles({ migrationsFolder: migrationsPath });
      const tagByWhen = await this.tryLoadMigrationTagByWhen(migrationsPath);

      await this.execSql(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric
        )
      `);

      const appliedRows = await this.allSql<{ hash: string }>(
        `SELECT hash FROM "__drizzle_migrations"`
      );
      const applied = new Set(appliedRows.map((r) => r.hash));

      // Recovery: if a previous run partially applied the workspace->task migration, finish it.
      // Symptom: `tasks` exists, `conversations` still has `workspace_id`, and `__new_conversations` exists.
      let recovered = false;
      if (
        (await this.tableExists('tasks')) &&
        (await this.tableExists('conversations')) &&
        (await this.tableExists('__new_conversations')) &&
        (await this.tableHasColumn('conversations', 'workspace_id')) &&
        !(await this.tableHasColumn('conversations', 'task_id'))
      ) {
        // Populate new conversations table from the old one (FK enforcement is OFF, so orphans won't block)
        await this.execSql(`
          INSERT INTO "__new_conversations"("id", "task_id", "title", "created_at", "updated_at")
          SELECT "id", "workspace_id", "title", "created_at", "updated_at" FROM "conversations"
        `);
        await this.execSql(`DROP TABLE "conversations";`);
        await this.execSql(`ALTER TABLE "__new_conversations" RENAME TO "conversations";`);
        await this.execSql(
          `CREATE INDEX IF NOT EXISTS "idx_conversations_task_id" ON "conversations" ("task_id");`
        );

        // Mark the workspace->task migration as applied (even if it wasn't tracked).
        // This prevents the hash-based runner from attempting to re-run it against a partially-migrated DB.
        await this.ensureMigrationMarkedApplied(
          migrationsPath,
          applied,
          '0002_lyrical_impossible_man'
        );
        recovered = true;
      }

      let appliedCount = 0;
      for (const migration of migrations) {
        if (applied.has(migration.hash)) continue;

        const tag = tagByWhen?.get(migration.folderMillis);
        // If the DB already reflects the workspace->task rename (e.g. user manually fixed their DB)
        // but the migration hash wasn't recorded, mark it as applied and move on.
        if (
          tag === '0002_lyrical_impossible_man' &&
          (await this.tableExists('tasks')) &&
          !(await this.tableExists('workspaces')) &&
          (await this.tableExists('conversations')) &&
          (await this.tableHasColumn('conversations', 'task_id'))
        ) {
          await this.runSql(
            `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(?, ?)`,
            [migration.hash, migration.folderMillis]
          );
          applied.add(migration.hash);
          continue;
        }

        // Execute each statement chunk (drizzle-kit uses '--> statement-breakpoint')
        for (const statement of migration.sql) {
          // We manage FK enforcement ourselves during migrations.
          const trimmed = statement.trim().toUpperCase();
          if (trimmed.startsWith('PRAGMA FOREIGN_KEYS=')) continue;
          await this.execSql(statement);
        }

        // Record as applied (same schema as Drizzle uses)
        await this.runSql(
          `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(?, ?)`,
          [migration.hash, migration.folderMillis]
        );

        applied.add(migration.hash);
        appliedCount += 1;
      }

      this.lastMigrationSummary = {
        appliedCount,
        totalMigrations: migrations.length,
        recovered,
      };

      DatabaseService.migrationsApplied = true;
    } finally {
      // Restore FK enforcement for normal operation (and ensure it's re-enabled on failure).
      await this.execSql('PRAGMA foreign_keys=ON;');
    }
  }

  private async tryLoadMigrationTagByWhen(
    migrationsFolder: string
  ): Promise<Map<number, string> | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('node:fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('node:path');
      const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
      if (!fs.existsSync(journalPath)) return null;
      const parsed: unknown = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return null;
      const entries = (parsed as { entries?: unknown }).entries;
      if (!Array.isArray(entries)) return null;

      const map = new Map<number, string>();
      for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const when = (e as { when?: unknown }).when;
        const tag = (e as { tag?: unknown }).tag;
        if (typeof when === 'number' && typeof tag === 'string') {
          map.set(when, tag);
        }
      }
      return map;
    } catch {
      return null;
    }
  }

  private async ensureMigrationMarkedApplied(
    migrationsFolder: string,
    applied: Set<string>,
    tag: string
  ): Promise<void> {
    // Only mark if the SQL file + journal entry exist.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('node:path');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('node:crypto');

    const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
    if (!fs.existsSync(journalPath)) return;
    const journalParsed: unknown = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const entries = (journalParsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return;
    const entry = entries.find((e) => {
      if (!e || typeof e !== 'object') return false;
      return (e as { tag?: unknown }).tag === tag;
    }) as { when?: unknown } | undefined;
    if (!entry) return;

    const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
    if (!fs.existsSync(sqlPath)) return;
    const contents = fs.readFileSync(sqlPath, 'utf8');
    const hash = crypto.createHash('sha256').update(contents).digest('hex');

    if (applied.has(hash)) return;
    const createdAt = typeof entry.when === 'number' ? entry.when : Date.now();
    await this.runSql(`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(?, ?)`, [
      hash,
      createdAt,
    ]);
    applied.add(hash);
  }

  private async tableExists(name: string): Promise<boolean> {
    const rows = await this.allSql<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${name.replace(/'/g, "''")}' LIMIT 1`
    );
    return rows.length > 0;
  }

  private async tableHasColumn(tableName: string, columnName: string): Promise<boolean> {
    if (!(await this.tableExists(tableName))) return false;
    const rows = await this.allSql<{ name: string }>(
      `PRAGMA table_info("${tableName.replace(/"/g, '""')}")`
    );
    return rows.some((r) => r.name === columnName);
  }

  private async allSql<T = any>(query: string): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');
    const trimmed = query.trim();
    if (!trimmed) return [];

    return await new Promise<T[]>((resolve, reject) => {
      this.db!.all(trimmed, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows ?? []) as T[]);
        }
      });
    });
  }

  private async runSql(statement: string, params: unknown[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const trimmed = statement.trim();
    if (!trimmed) return;

    await new Promise<void>((resolve, reject) => {
      this.db!.run(trimmed, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async execSql(statement: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const trimmed = statement.trim();
    if (!trimmed) return;

    await new Promise<void>((resolve, reject) => {
      this.db!.exec(trimmed, (err) => {
        if (err) {
          // Handle idempotent migration cases - skip if schema already matches
          const msg = err.message ?? '';
          if (msg.includes('duplicate column name') || msg.includes('already exists')) {
            // Schema change already applied, continue
            resolve();
            return;
          }
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

export const databaseService = new DatabaseService();
