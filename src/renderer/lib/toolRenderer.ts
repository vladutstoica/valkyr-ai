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
  ToggleRightIcon,
  BotIcon,
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

  // ACP ToolKind categories (used when title isn't available)
  execute: 'bash',
  read: 'read_file',
  // edit already mapped above
  delete: 'edit_file',
  move: 'edit_file',
  // fetch already mapped above
  think: 'search',
  other: 'unknown',
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

/** Extract a non-empty string from args, trying multiple keys. */
function extractArg(args: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Get a display-friendly label for a tool invocation.
 * Returns null when there is not enough information to produce a meaningful label.
 */
export function getToolDisplayLabel(
  toolName: string,
  args: Record<string, unknown>
): string | null {
  // ACP provides a human-readable title (e.g. "Read src/renderer/components/AcpChatPane.tsx")
  const title = extractArg(args, 'title');
  if (title) return title;

  const normalized = normalizeToolName(toolName);

  switch (normalized) {
    case 'read_file': {
      const fp = extractArg(args, 'file_path', 'path', 'file');
      return fp ? `Read ${fp}` : null;
    }
    case 'write_file': {
      const fp = extractArg(args, 'file_path', 'path', 'file');
      return fp ? `Write ${fp}` : null;
    }
    case 'edit_file': {
      const fp = extractArg(args, 'file_path', 'path', 'file');
      return fp ? `Edit ${fp}` : null;
    }
    case 'bash': {
      const cmd = extractArg(args, 'command', 'cmd');
      return cmd ? `Run ${cmd.slice(0, 80)}` : null;
    }
    case 'list_files': {
      const target = extractArg(args, 'pattern', 'path', 'directory');
      return target ? `List ${target}` : null;
    }
    case 'search': {
      const q = extractArg(args, 'pattern', 'query', 'regex');
      return q ? `Search "${q}"` : null;
    }
    case 'web_search': {
      const q = extractArg(args, 'query');
      return q ? `Search web: ${q.slice(0, 60)}` : null;
    }
    case 'web_fetch': {
      const url = extractArg(args, 'url');
      return url ? `Fetch ${url}` : null;
    }
    case 'notebook_edit': {
      const nb = extractArg(args, 'notebook_path', 'path');
      return nb ? `Edit ${nb}` : null;
    }
    case 'task': {
      const agentType = extractArg(args, 'subagent_type');
      const desc = extractArg(args, 'description');
      if (agentType && desc) return `${agentType}: ${desc.slice(0, 60)}`;
      if (agentType) return agentType;
      if (desc) return desc.slice(0, 60);
      return null;
    }
    default: {
      if (toolName === 'switch_mode') {
        const mode = extractArg(args, 'mode_slug', 'mode', 'title');
        return mode ? `Switch to ${mode} mode` : null;
      }
      return null;
    }
  }
}

/**
 * Get a short, human-readable step label for a tool invocation (used in ChainOfThought).
 * Returns null when there is not enough information to produce a meaningful label.
 *
 * Priority:
 * 1. ACP `title` field — already a human-readable description from the agent
 * 2. Bash `description` field — a short human-readable summary
 * 3. Smart extraction from tool args (filename from path, truncated commands, etc.)
 */
export function getToolStepLabel(toolName: string, args: Record<string, unknown>): string | null {
  // ACP provides a human-readable title — use it first
  const title = extractArg(args, 'title');
  if (title) return title;

  // Bash description field is a short human-readable summary
  const desc = extractArg(args, 'description');
  if (desc) return desc;

  const normalized = normalizeToolName(toolName);

  switch (normalized) {
    case 'read_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Read ${name}` : null;
    }
    case 'write_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Write ${name}` : null;
    }
    case 'edit_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Edit ${name}` : null;
    }
    case 'bash': {
      const cmd = extractArg(args, 'command', 'cmd');
      return cmd ? `Run \`${cmd.slice(0, 50)}\`` : null;
    }
    case 'list_files': {
      const pattern = extractArg(args, 'pattern');
      if (pattern) return `List ${pattern}`;
      const dir = extractFilename(args.path || args.directory);
      return dir ? `List ${dir}/` : null;
    }
    case 'search': {
      const q = extractArg(args, 'pattern', 'query', 'regex');
      return q ? `Search for "${q.slice(0, 40)}"` : null;
    }
    case 'web_search': {
      const q = extractArg(args, 'query');
      return q ? `Search web for "${q.slice(0, 40)}"` : null;
    }
    case 'web_fetch': {
      const url = extractArg(args, 'url');
      if (url) {
        try {
          return `Fetch ${new URL(url).hostname}`;
        } catch {
          return `Fetch ${url.slice(0, 40)}`;
        }
      }
      return null;
    }
    case 'notebook_edit': {
      const nb = extractFilename(args.notebook_path || args.path);
      return nb ? `Edit ${nb}` : null;
    }
    case 'task': {
      const agentType = extractArg(args, 'subagent_type');
      const taskDesc = extractArg(args, 'description', 'prompt');
      if (agentType && taskDesc) return `${agentType}: ${taskDesc.slice(0, 50)}`;
      if (agentType) return agentType;
      if (taskDesc) return taskDesc.slice(0, 50);
      return null;
    }
    default: {
      if (toolName === 'switch_mode') {
        const mode = extractArg(args, 'mode_slug', 'mode');
        return mode ? `Switch to ${mode} mode` : null;
      }
      // For MCP or other named tools, humanize the tool name only if it's meaningful
      if (toolName && toolName !== 'tool' && toolName !== 'unknown') {
        const humanized = toolName
          .replace(/^mcp__[^_]+__/, '') // strip MCP prefix
          .replace(/_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase();
        const result = humanized.charAt(0).toUpperCase() + humanized.slice(1);
        // Only return if we got something meaningful (not just "execute", "other", etc.)
        if (result.length > 2) return result;
      }
      return null;
    }
  }
}

/**
 * Get the Lucide icon component for a tool.
 */
export function getToolIconComponent(toolName: string): LucideIcon {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'read_file':
      return FileTextIcon;
    case 'write_file':
      return FilePlusIcon;
    case 'edit_file':
      return FileEditIcon;
    case 'bash':
      return TerminalIcon;
    case 'list_files':
      return FolderTreeIcon;
    case 'search':
      return SearchIcon;
    case 'web_search':
      return GlobeIcon;
    case 'web_fetch':
      return GlobeIcon;
    case 'notebook_edit':
      return BookOpenIcon;
    case 'task':
      return BotIcon;
    default: {
      if (toolName === 'switch_mode') return ToggleRightIcon;
      return WrenchIcon;
    }
  }
}

/**
 * Get an icon name (lucide) for a tool.
 */
export function getToolIcon(toolName: string): string {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'read_file':
      return 'FileText';
    case 'write_file':
      return 'FilePlus';
    case 'edit_file':
      return 'FileEdit';
    case 'bash':
      return 'Terminal';
    case 'list_files':
      return 'FolderTree';
    case 'search':
      return 'Search';
    case 'web_search':
      return 'Globe';
    case 'web_fetch':
      return 'Globe';
    case 'notebook_edit':
      return 'BookOpen';
    case 'task':
      return 'Bot';
    default:
      return 'Wrench';
  }
}

/**
 * Map a file extension to a shiki BundledLanguage name.
 * Falls back to 'text' for unknown extensions.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  mdx: 'mdx',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
  zig: 'zig',
  prisma: 'prisma',
  tf: 'hcl',
  ini: 'ini',
  env: 'dotenv',
};

export function getLanguageFromPath(filePath: string): string {
  if (!filePath) return 'text';

  const filename = filePath.split('/').pop() ?? '';
  const lower = filename.toLowerCase();

  // Handle dotfiles like Dockerfile, Makefile
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';

  const ext = lower.includes('.') ? (lower.split('.').pop() ?? '') : '';
  return EXTENSION_TO_LANGUAGE[ext] || 'text';
}
