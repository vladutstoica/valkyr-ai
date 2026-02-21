import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const appState = sqliteTable('app_state', {
  id: integer('id').primaryKey().default(1),
  activeProjectId: text('active_project_id'),
  activeTaskId: text('active_task_id'),
  activeWorkspaceId: text('active_workspace_id'),
  prMode: text('pr_mode'),
  prDraft: integer('pr_draft').default(0),
});

export const sshConnections = sqliteTable(
  'ssh_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull().default(22),
    username: text('username').notNull(),
    authType: text('auth_type').notNull().default('agent'), // 'password' | 'key' | 'agent'
    privateKeyPath: text('private_key_path'), // optional, for key auth
    useAgent: integer('use_agent').notNull().default(0), // boolean, 0=false, 1=true
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: uniqueIndex('idx_ssh_connections_name').on(table.name),
    hostIdx: index('idx_ssh_connections_host').on(table.host),
  })
);

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('blue'),
  emoji: text('emoji'),
  displayOrder: integer('display_order').notNull().default(0),
  isDefault: integer('is_default').notNull().default(0), // boolean, 0=false, 1=true
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const projectGroups = sqliteTable('project_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  isCollapsed: integer('is_collapsed').notNull().default(0), // boolean, 0=false, 1=true
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    gitRemote: text('git_remote'),
    gitBranch: text('git_branch'),
    baseRef: text('base_ref'),
    githubRepository: text('github_repository'),
    githubConnected: integer('github_connected').notNull().default(0),
    sshConnectionId: text('ssh_connection_id').references(() => sshConnections.id, {
      onDelete: 'set null',
    }),
    isRemote: integer('is_remote').notNull().default(0), // boolean, 0=false, 1=true
    remotePath: text('remote_path'), // path on remote server
    subRepos: text('sub_repos'), // JSON array of SubRepo for multi-repo projects
    displayOrder: integer('display_order').notNull().default(0), // Order in sidebar
    groupId: text('group_id').references(() => projectGroups.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pathIdx: uniqueIndex('idx_projects_path').on(table.path),
    sshConnectionIdIdx: index('idx_projects_ssh_connection_id').on(table.sshConnectionId),
    isRemoteIdx: index('idx_projects_is_remote').on(table.isRemote),
    groupIdIdx: index('idx_projects_group_id').on(table.groupId),
    workspaceIdIdx: index('idx_projects_workspace_id').on(table.workspaceId),
  })
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    branch: text('branch').notNull(),
    path: text('path').notNull(),
    status: text('status').notNull().default('idle'),
    agentId: text('agent_id'),
    metadata: text('metadata'),
    useWorktree: integer('use_worktree').notNull().default(1),
    archivedAt: text('archived_at'), // null = active, timestamp = archived
    isPinned: integer('is_pinned').default(0),
    lastAgent: text('last_agent'),
    lockedAgent: text('locked_agent'),
    initialPromptSent: integer('initial_prompt_sent').default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdIdx: index('idx_tasks_project_id').on(table.projectId),
    pathIdx: index('idx_tasks_path').on(table.path),
  })
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    provider: text('provider'), // AI provider for this chat (claude, codex, qwen, etc.)
    mode: text('mode').default('acp'), // 'pty' | 'acp' — determines rendering mode
    acpSessionId: text('acp_session_id'), // ACP session ID for potential future session resume
    isActive: integer('is_active').notNull().default(0), // 1 if this is the active chat for the task
    isMain: integer('is_main').notNull().default(0), // 1 if this is the main/primary chat (gets full persistence)
    displayOrder: integer('display_order').notNull().default(0), // Order in the tab bar
    metadata: text('metadata'), // JSON for additional chat-specific data
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskIdIdx: index('idx_conversations_task_id').on(table.taskId),
    activeIdx: index('idx_conversations_active').on(table.taskId, table.isActive), // Index for quick active conversation lookup
  })
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    sender: text('sender').notNull(),
    parts: text('parts'), // JSON-serialized structured message parts (text, reasoning, tool-invocation)
    timestamp: text('timestamp')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata'),
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
    timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
  })
);

export const lineComments = sqliteTable(
  'line_comments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    lineNumber: integer('line_number').notNull(),
    lineContent: text('line_content'),
    content: text('content').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sentAt: text('sent_at'), // NULL = unsent, timestamp = when injected to chat
  },
  (table) => ({
    taskFileIdx: index('idx_line_comments_task_file').on(table.taskId, table.filePath),
  })
);

export const terminalSessions = sqliteTable(
  'terminal_sessions',
  {
    id: text('id').primaryKey(),
    taskKey: text('task_key').notNull(),
    terminalId: text('terminal_id').notNull(),
    title: text('title').notNull(),
    cwd: text('cwd'),
    isActive: integer('is_active').default(0),
    displayOrder: integer('display_order').default(0),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskKeyIdx: index('idx_terminal_sessions_task_key').on(table.taskKey),
  })
);

export const kanbanColumns = sqliteTable('kanban_columns', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  status: text('status').notNull().default('todo'),
});

export const sshConnectionsRelations = relations(sshConnections, ({ many }) => ({
  projects: many(projects),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  projects: many(projects),
}));

export const projectGroupsRelations = relations(projectGroups, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tasks: many(tasks),
  sshConnection: one(sshConnections, {
    fields: [projects.sshConnectionId],
    references: [sshConnections.id],
  }),
  group: one(projectGroups, {
    fields: [projects.groupId],
    references: [projectGroups.id],
  }),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  conversations: many(conversations),
  lineComments: many(lineComments),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  task: one(tasks, {
    fields: [conversations.taskId],
    references: [tasks.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const lineCommentsRelations = relations(lineComments, ({ one }) => ({
  task: one(tasks, {
    fields: [lineComments.taskId],
    references: [tasks.id],
  }),
}));

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type SshConnectionRow = typeof sshConnections.$inferSelect;
export type SshConnectionInsert = typeof sshConnections.$inferInsert;
export type ProjectGroupRow = typeof projectGroups.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type LineCommentRow = typeof lineComments.$inferSelect;
export type LineCommentInsert = typeof lineComments.$inferInsert;
export type AppStateRow = typeof appState.$inferSelect;
export type TerminalSessionRow = typeof terminalSessions.$inferSelect;
export type KanbanColumnRow = typeof kanbanColumns.$inferSelect;
