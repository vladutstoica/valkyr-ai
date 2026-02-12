-- Add sub_repos column to projects table for multi-repo projects
ALTER TABLE `projects` ADD COLUMN `sub_repos` text;
