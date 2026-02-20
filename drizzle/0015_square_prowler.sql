CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`active_project_id` text,
	`active_task_id` text,
	`active_workspace_id` text,
	`pr_mode` text,
	`pr_draft` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `kanban_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_key` text NOT NULL,
	`terminal_id` text NOT NULL,
	`title` text NOT NULL,
	`cwd` text,
	`is_active` integer DEFAULT 0,
	`display_order` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `is_pinned` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tasks` ADD `last_agent` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `locked_agent` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `initial_prompt_sent` integer DEFAULT 0;--> statement-breakpoint
CREATE INDEX `idx_terminal_sessions_task_key` ON `terminal_sessions` (`task_key`);