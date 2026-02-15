-- Create project_groups table
CREATE TABLE IF NOT EXISTS `project_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer NOT NULL DEFAULT 0,
	`is_collapsed` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
-- Add group_id column to projects table
ALTER TABLE `projects` ADD COLUMN `group_id` text REFERENCES `project_groups`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_projects_group_id` ON `projects` (`group_id`);
