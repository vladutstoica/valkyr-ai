-- Create workspaces table
CREATE TABLE IF NOT EXISTS `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT 'blue',
	`emoji` text,
	`display_order` integer NOT NULL DEFAULT 0,
	`is_default` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
-- Add workspace_id column to projects table
ALTER TABLE `projects` ADD COLUMN `workspace_id` text REFERENCES `workspaces`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_projects_workspace_id` ON `projects` (`workspace_id`);
