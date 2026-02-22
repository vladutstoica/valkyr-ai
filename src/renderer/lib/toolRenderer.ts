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
  GlobeIcon,
  BookOpenIcon,
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

  // Web
  WebSearch: 'web_search',
  web_search: 'web_search',
  WebFetch: 'web_fetch',
  web_fetch: 'web_fetch',
  fetch: 'web_fetch',

  // Notebook
  NotebookEdit: 'notebook_edit',
  notebook_edit: 'notebook_edit',

  // Task / agent delegation
  Task: 'task',
  task: 'task',
};

export type NormalizedToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'bash'
  | 'list_files'
  | 'search'
  | 'web_search'
  | 'web_fetch'
  | 'notebook_edit'
  | 'task'
  | 'unknown';

export function normalizeToolName(toolName: string): NormalizedToolName {
  return (TOOL_NAME_MAP[toolName] as NormalizedToolName) || 'unknown';
}

/** Extract just the filename from a path string. */
function extractFilename(val: unknown): string {
  if (typeof val !== 'string' || !val) return '';
  const parts = val.split('/');
  return parts[parts.length - 1];
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
    case 'web_search':
      return `Search web: ${((args.query || '') as string).slice(0, 60)}`;
    case 'web_fetch':
      return `Fetch ${(args.url || '') as string}`;
    case 'notebook_edit':
      return `Edit notebook`;
    case 'task':
      return `Task: ${((args.description || '') as string).slice(0, 60)}`;
    default:
      return toolName;
  }
}

/**
 * Get a short, human-readable step label for a tool invocation (used in ChainOfThought).
 *
 * Priority:
 * 1. ACP `title` field — already a human-readable description from the agent
 * 2. Smart extraction from tool args (filename from path, truncated commands, etc.)
 * 3. Fallback to a sensible default per tool type
 */
export function getToolStepLabel(toolName: string, args: Record<string, unknown>): string {
  // ACP provides a human-readable title (e.g., "Read file: package.json") — use it first
  if (typeof args.title === 'string' && args.title) {
    return args.title;
  }

  // Bash description field is a short human-readable summary
  if (typeof args.description === 'string' && args.description) {
    return args.description;
  }

  const normalized = normalizeToolName(toolName);

  switch (normalized) {
    case 'read_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Read ${name}` : 'Read file';
    }
    case 'write_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Write ${name}` : 'Write file';
    }
    case 'edit_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Edit ${name}` : 'Edit file';
    }
    case 'bash': {
      const cmd = ((args.command || args.cmd || '') as string).slice(0, 50);
      return cmd ? `Run \`${cmd}\`` : 'Run command';
    }
    case 'list_files': {
      const pattern = (args.pattern || '') as string;
      const dir = extractFilename(args.path || args.directory);
      return pattern ? `List ${pattern}` : dir ? `List ${dir}/` : 'List files';
    }
    case 'search': {
      const q = (args.pattern || args.query || args.regex || '') as string;
      return q ? `Search for "${q.slice(0, 40)}"` : 'Search codebase';
    }
    case 'web_search': {
      const q = (args.query || '') as string;
      return q ? `Search web for "${q.slice(0, 40)}"` : 'Search web';
    }
    case 'web_fetch': {
      const url = (args.url || '') as string;
      if (url) {
        try {
          return `Fetch ${new URL(url).hostname}`;
        } catch { /* fallthrough */ }
      }
      return 'Fetch URL';
    }
    case 'notebook_edit': {
      const nb = extractFilename(args.notebook_path || args.path);
      return nb ? `Edit ${nb}` : 'Edit notebook';
    }
    case 'task': {
      const desc = (args.description || args.prompt || '') as string;
      return desc ? desc.slice(0, 50) : 'Run sub-task';
    }
    default: {
      // For MCP or unknown tools, humanize the tool name
      const humanized = toolName
        .replace(/^mcp__[^_]+__/, '')  // strip MCP prefix
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();
      return humanized.charAt(0).toUpperCase() + humanized.slice(1);
    }
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
    case 'web_search': return GlobeIcon;
    case 'web_fetch': return GlobeIcon;
    case 'notebook_edit': return BookOpenIcon;
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
    case 'web_search': return 'Globe';
    case 'web_fetch': return 'Globe';
    case 'notebook_edit': return 'BookOpen';
    default: return 'Wrench';
  }
}
