-- Add display_order column to projects table for sidebar ordering
ALTER TABLE `projects` ADD COLUMN `display_order` integer NOT NULL DEFAULT 0;
