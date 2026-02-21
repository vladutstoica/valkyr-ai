ALTER TABLE `conversations` ADD `mode` text DEFAULT 'pty';--> statement-breakpoint
ALTER TABLE `conversations` ADD `acp_session_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `parts` text;