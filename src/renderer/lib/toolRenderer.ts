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

/**
 * Map ACP ToolKind to a NormalizedToolName.
 * Use this when the tool part has `callProviderMetadata.acp.kind`
 * to get a more reliable normalization than guessing from toolName.
 */
const KIND_TO_NORMALIZED: Record<string, NormalizedToolName> = {
  read: 'read_file',
  edit: 'edit_file',
  delete: 'edit_file',
  move: 'edit_file',
  search: 'search',
  execute: 'bash',
  think: 'search',
  fetch: 'web_fetch',
  switch_mode: 'unknown',
  other: 'unknown',
};

export function normalizeFromKind(kind: string): NormalizedToolName {
  return KIND_TO_NORMALIZED[kind] || 'unknown';
}

/** Extract just the filename from a path string. */
function extractFilename(val: unknown): string {
  if (typeof val !== 'string' || !val) return '';
  const parts = val.split('/');
  return parts[parts.length - 1];
}

/** Count non-empty lines in a string. */
function countLines(val: unknown): number {
  if (typeof val !== 'string' || !val) return 0;
  return val.split('\n').filter((l) => l.trim()).length;
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
 * Always returns a non-empty string — never drops a tool silently.
 *
 * @param toolName - The raw tool name (e.g. "Read", "bash", "mcp__playwright__click")
 * @param args - Tool input arguments (rawInput from ACP)
 * @param acpTitle - Optional AI SDK title field (from ACP ToolCall.title, passed via providerMetadata)
 */
export function getToolDisplayLabel(
  toolName: string,
  args: Record<string, unknown>,
  acpTitle?: string
): string {
  // ACP title from AI SDK (set via tool-input-available chunk's title field)
  // takes priority — it's the authoritative human-readable description from the agent.
  if (acpTitle) return acpTitle;

  // Fallback: check if the title was stuffed into args (legacy path)
  const title = extractArg(args, 'title');
  if (title) return title;

  const normalized = normalizeToolName(toolName);

  switch (normalized) {
    case 'read_file': {
      const fp = extractArg(args, 'file_path', 'path', 'file');
      return fp ? `Read ${fp}` : 'Read file';
    }
    case 'write_file': {
      const fp = extractArg(args, 'file_path', 'path', 'file');
      return fp ? `Write ${fp}` : 'Write file';
    }
    case 'edit_file': {
      const fp = extractArg(args, 'file_path', 'path', 'file');
      return fp ? `Edit ${fp}` : 'Edit file';
    }
    case 'bash': {
      const cmd = extractArg(args, 'command', 'cmd');
      return cmd ? `Run ${cmd.slice(0, 80)}` : 'Run command';
    }
    case 'list_files': {
      const target = extractArg(args, 'pattern', 'path', 'directory');
      return target ? `List ${target}` : 'List files';
    }
    case 'search': {
      const q = extractArg(args, 'pattern', 'query', 'regex');
      return q ? `Search "${q}"` : 'Search';
    }
    case 'web_search': {
      const q = extractArg(args, 'query');
      return q ? `Search web: ${q.slice(0, 60)}` : 'Web search';
    }
    case 'web_fetch': {
      const url = extractArg(args, 'url');
      return url ? `Fetch ${url}` : 'Fetch URL';
    }
    case 'notebook_edit': {
      const nb = extractArg(args, 'notebook_path', 'path');
      return nb ? `Edit ${nb}` : 'Edit notebook';
    }
    case 'task': {
      const agentType = extractArg(args, 'subagent_type');
      const desc = extractArg(args, 'description');
      if (agentType && desc) return `${agentType}: ${desc.slice(0, 60)}`;
      if (agentType) return agentType;
      if (desc) return desc.slice(0, 60);
      return 'Agent task';
    }
    default: {
      if (toolName === 'switch_mode') {
        const mode = extractArg(args, 'mode_slug', 'mode', 'title');
        return mode ? `Switch to ${mode} mode` : 'Switch mode';
      }
      // For MCP or any other named tool, humanize the tool name so nothing is silently dropped
      return humanizeToolName(toolName);
    }
  }
}

/**
 * Humanize a raw tool name into a display-friendly string.
 * Strips MCP prefixes, converts separators to spaces, and title-cases.
 * Returns a fallback string ('Tool call') if the name is empty or generic.
 */
function humanizeToolName(toolName: string): string {
  if (!toolName || toolName === 'tool' || toolName === 'unknown') return 'Tool call';
  const humanized = toolName
    .replace(/^mcp__[^_]+__/, '') // strip MCP server prefix (e.g. mcp__playwright__)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  if (humanized.length <= 2) return toolName; // keep raw name if humanization is too short
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

/**
 * Get a short, human-readable step label for a tool invocation (used in ChainOfThought).
 * Always returns a non-empty string — never drops a tool silently.
 *
 * Priority:
 * 1. ACP `title` from AI SDK (the authoritative label from the agent)
 * 2. ACP `title` from args (legacy fallback)
 * 3. Bash `description` field — a short human-readable summary
 * 4. Smart extraction from tool args (filename from path, truncated commands, etc.)
 * 5. Humanized tool name as ultimate fallback
 */
export function getToolStepLabel(
  toolName: string,
  args: Record<string, unknown>,
  output?: unknown,
  acpTitle?: string
): string {
  const lines = countLines(output);
  const suffix = lines > 0 ? ` (${lines} lines)` : '';

  // ACP title from AI SDK takes priority
  if (acpTitle) return acpTitle + suffix;

  // Fallback: ACP title stuffed into args (legacy path)
  const title = extractArg(args, 'title');
  if (title) return title + suffix;

  // Bash description field is a short human-readable summary
  const desc = extractArg(args, 'description');
  if (desc) return desc + suffix;

  const normalized = normalizeToolName(toolName);

  switch (normalized) {
    case 'read_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Read ${name}${suffix}` : `Read file${suffix}`;
    }
    case 'write_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      return name ? `Write ${name}${suffix}` : `Write file${suffix}`;
    }
    case 'edit_file': {
      const name = extractFilename(args.file_path || args.path || args.file);
      const added = countLines(args.new_string);
      const removed = countLines(args.old_string);
      const diffSuffix = added || removed ? ` (+${added} -${removed})` : suffix;
      return name ? `Edit ${name}${diffSuffix}` : `Edit file${diffSuffix}`;
    }
    case 'bash': {
      const cmd = extractArg(args, 'command', 'cmd');
      return cmd ? `Run \`${cmd.slice(0, 50)}\`${suffix}` : `Run command${suffix}`;
    }
    case 'list_files': {
      const pattern = extractArg(args, 'pattern');
      const matchSuffix = lines > 0 ? ` (${lines} matches)` : '';
      if (pattern) return `List ${pattern}${matchSuffix}`;
      const dir = extractFilename(args.path || args.directory);
      return dir ? `List ${dir}/${matchSuffix}` : `List files${matchSuffix}`;
    }
    case 'search': {
      const q = extractArg(args, 'pattern', 'query', 'regex');
      const matchSuffix = lines > 0 ? ` (${lines} matches)` : '';
      return q ? `Search for "${q.slice(0, 40)}"${matchSuffix}` : `Search${matchSuffix}`;
    }
    case 'web_search': {
      const q = extractArg(args, 'query');
      const resultSuffix = lines > 0 ? ` (${lines} results)` : '';
      return q ? `Search web for "${q.slice(0, 40)}"${resultSuffix}` : `Web search${resultSuffix}`;
    }
    case 'web_fetch': {
      const url = extractArg(args, 'url');
      if (url) {
        try {
          return `Fetch ${new URL(url).hostname}${suffix}`;
        } catch {
          return `Fetch ${url.slice(0, 40)}${suffix}`;
        }
      }
      return `Fetch URL${suffix}`;
    }
    case 'notebook_edit': {
      const nb = extractFilename(args.notebook_path || args.path);
      return nb ? `Edit ${nb}` : 'Edit notebook';
    }
    case 'task': {
      const agentType = extractArg(args, 'subagent_type');
      const taskDesc = extractArg(args, 'description', 'prompt');
      if (agentType && taskDesc) return `${agentType}: ${taskDesc.slice(0, 50)}`;
      if (agentType) return agentType;
      if (taskDesc) return taskDesc.slice(0, 50);
      return 'Agent task';
    }
    default: {
      if (toolName === 'switch_mode') {
        const mode = extractArg(args, 'mode_slug', 'mode');
        return mode ? `Switch to ${mode} mode` : 'Switch mode';
      }
      return humanizeToolName(toolName) + suffix;
    }
  }
}

/**
 * Get the Lucide icon component for a tool.
 * When ACP kind is available, use it for more reliable icon mapping.
 */
export function getToolIconComponent(toolName: string, acpKind?: string): LucideIcon {
  const normalized = acpKind ? normalizeFromKind(acpKind) : normalizeToolName(toolName);
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
