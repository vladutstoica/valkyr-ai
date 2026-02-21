/**
 * Tool name normalizer — maps provider-specific tool names to canonical names.
 * Agents use different naming conventions for the same operations.
 */

import type { LucideIcon } from 'lucide-react';
import {
  FileTextIcon,
  FilePlusIcon,
  FileEditIcon,
  TerminalIcon,
  FolderTreeIcon,
  SearchIcon,
  WrenchIcon,
} from 'lucide-react';

const TOOL_NAME_MAP: Record<string, string> = {
  // File read
  Read: 'read_file',
  read_file: 'read_file',
  file_read: 'read_file',
  cat: 'read_file',

  // File write
  Write: 'write_file',
  write_file: 'write_file',
  file_write: 'write_file',

  // File edit
  Edit: 'edit_file',
  edit_file: 'edit_file',
  file_edit: 'edit_file',
  patch: 'edit_file',

  // Shell / terminal
  Bash: 'bash',
  bash: 'bash',
  shell: 'bash',
  execute_command: 'bash',
  terminal: 'bash',
  run_command: 'bash',

  // File listing
  Glob: 'list_files',
  list_files: 'list_files',
  ls: 'list_files',
  list_directory: 'list_files',

  // Search / grep
  Grep: 'search',
  grep: 'search',
  search: 'search',
  file_search: 'search',
  ripgrep: 'search',
};

export type NormalizedToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'bash'
  | 'list_files'
  | 'search'
  | 'unknown';

export function normalizeToolName(toolName: string): NormalizedToolName {
  return (TOOL_NAME_MAP[toolName] as NormalizedToolName) || 'unknown';
}

/**
 * Get a display-friendly label for a tool invocation.
 */
export function getToolDisplayLabel(toolName: string, args: Record<string, unknown>): string {
  const normalized = normalizeToolName(toolName);

  switch (normalized) {
    case 'read_file':
      return `Read ${(args.file_path || args.path || args.file || '') as string}`;
    case 'write_file':
      return `Write ${(args.file_path || args.path || args.file || '') as string}`;
    case 'edit_file':
      return `Edit ${(args.file_path || args.path || args.file || '') as string}`;
    case 'bash':
      return `Run ${((args.command || args.cmd || '') as string).slice(0, 60)}`;
    case 'list_files':
      return `List ${(args.pattern || args.path || args.directory || '') as string}`;
    case 'search':
      return `Search "${(args.pattern || args.query || args.regex || '') as string}"`;
    default:
      return toolName;
  }
}

/**
 * Get the Lucide icon component for a tool.
 */
export function getToolIconComponent(toolName: string): LucideIcon {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'read_file': return FileTextIcon;
    case 'write_file': return FilePlusIcon;
    case 'edit_file': return FileEditIcon;
    case 'bash': return TerminalIcon;
    case 'list_files': return FolderTreeIcon;
    case 'search': return SearchIcon;
    default: return WrenchIcon;
  }
}

/**
 * Get an icon name (lucide) for a tool.
 */
export function getToolIcon(toolName: string): string {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'read_file': return 'FileText';
    case 'write_file': return 'FilePlus';
    case 'edit_file': return 'FileEdit';
    case 'bash': return 'Terminal';
    case 'list_files': return 'FolderTree';
    case 'search': return 'Search';
    default: return 'Wrench';
  }
}
