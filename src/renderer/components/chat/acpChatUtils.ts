import type { UIMessage } from 'ai';

/** Regex to detect stack traces: 3+ lines starting with "at " */
export const STACK_TRACE_PATTERN = /(?:^\s*at\s+.+$[\n\r]*){3,}/m;
import { normalizeToolName, normalizeFromKind } from '../../lib/toolRenderer';
import { getAcpMeta } from '../../lib/acpChatTransport';

/** Extract all text content from a UIMessage's parts array. */
export function getTextFromParts(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/** Extract file path from tool args or ACP title. */
export function extractFilePath(inputObj: Record<string, unknown>): string {
  let fp = ((inputObj.file_path || inputObj.path || inputObj.file || '') as string).trim();
  if (!fp && typeof inputObj.title === 'string' && inputObj.title) {
    const parts = inputObj.title.split(/\s+/);
    if (parts.length >= 2) fp = parts.slice(1).join(' ');
  }
  return fp;
}

/** Extract bash command from tool args or ACP title. */
export function extractBashCommand(inputObj: Record<string, unknown>): string {
  let cmd = ((inputObj.command || inputObj.cmd || '') as string).trim();
  if (!cmd && typeof inputObj.title === 'string' && inputObj.title) {
    cmd = inputObj.title.replace(/^Run\s+/, '');
  }
  if (!cmd && typeof inputObj.description === 'string') {
    cmd = (inputObj.description as string).trim();
  }
  return cmd;
}

/** Compute +N / -M diff stats from old_string / new_string. */
export function computeDiffStats(
  inputObj: Record<string, unknown>
): { added: number; removed: number } | null {
  const oldStr = typeof inputObj.old_string === 'string' ? inputObj.old_string : '';
  const newStr = typeof inputObj.new_string === 'string' ? inputObj.new_string : '';
  if (!oldStr && !newStr) return null;
  const oldLines = oldStr ? oldStr.split('\n').length : 0;
  const newLines = newStr ? newStr.split('\n').length : 0;
  return {
    added: Math.max(0, newLines - oldLines + (oldLines > 0 ? oldLines : 0)),
    removed: oldLines,
  };
}

/** Extract markdown sources section from text. */
export function extractMarkdownSources(
  text: string
): { text: string; sources: Array<{ title: string; url: string }> } | null {
  // Match a trailing "Sources:" or "**Sources:**" section followed by a markdown list of links
  const sourcesMatch = text.match(
    /\n\n(?:\*{0,2}Sources:?\*{0,2})\s*\n((?:\s*[-*]\s+\[.+?\]\(.+?\)\s*\n?)+)\s*$/i
  );
  if (!sourcesMatch) return null;

  const sources: Array<{ title: string; url: string }> = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(sourcesMatch[1])) !== null) {
    sources.push({ title: match[1], url: match[2] });
  }

  if (sources.length === 0) return null;

  const cleanedText = text.slice(0, sourcesMatch.index!).trimEnd();
  return { text: cleanedText, sources };
}

/**
 * Scan all messages backwards for plan file content or path.
 * Returns { content, path } — content is set if the tool part has inline data,
 * path is set if we found a Write tool output referencing a /plans/*.md file.
 */
export function findPlanFileInfo(messages: UIMessage[]): {
  content: string | null;
  path: string | null;
} {
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const msg = messages[mi];
    if (msg.role !== 'assistant') continue;
    const parts = msg.parts ?? [];
    for (let pi = parts.length - 1; pi >= 0; pi--) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const part = parts[pi] as any;
      // AI SDK uses both 'tool-invocation' and 'tool-{name}' type formats
      if (!part?.type?.startsWith('tool-') && part?.type !== 'tool-invocation') continue;
      const prevName = normalizeToolName(part.toolName || '');
      const acpKind = getAcpMeta(part)?.kind;
      const fp = String(part.input?.file_path || part.input?.path || '');

      // Check inline content from input (non-ACP path, e.g. local agents)
      if (fp.includes('/plans/') && fp.endsWith('.md')) {
        if (
          (prevName === 'write_file' || acpKind === 'edit') &&
          typeof part.input?.content === 'string' &&
          part.input.content
        ) {
          return { content: part.input.content, path: fp };
        }
        if ((prevName === 'read_file' || acpKind === 'read') && part.output) {
          return { content: String(part.output), path: fp };
        }
      }

      // ACP: Write tool output contains the file path but no content
      const output = typeof part.output === 'string' ? part.output : '';
      if (output.includes('/plans/') && output.includes('.md')) {
        const match = output.match(/(?:at|to|:)\s*(\/[^\s]+\/plans\/[^\s]+\.md)/);
        if (match) {
          return { content: null, path: match[1] };
        }
      }
    }
  }
  return { content: null, path: null };
}

/** Summarize a group of tool calls by type, e.g. "Read 5 files, ran 3 commands" */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function summarizeToolRun(toolRun: Array<{ part: any }>): string {
  const counts: Record<string, number> = {};
  for (const t of toolRun) {
    const tKind = getAcpMeta(t.part)?.kind;
    const name = tKind
      ? normalizeFromKind(tKind)
      : normalizeToolName(t.part.toolName || t.part.type?.replace(/^tool-/, '') || '');
    counts[name] = (counts[name] || 0) + 1;
  }
  const parts: string[] = [];
  if (counts.read_file)
    parts.push(`Read ${counts.read_file} file${counts.read_file > 1 ? 's' : ''}`);
  if (counts.write_file)
    parts.push(`wrote ${counts.write_file} file${counts.write_file > 1 ? 's' : ''}`);
  if (counts.edit_file)
    parts.push(`edited ${counts.edit_file} file${counts.edit_file > 1 ? 's' : ''}`);
  if (counts.bash) parts.push(`ran ${counts.bash} command${counts.bash > 1 ? 's' : ''}`);
  if (counts.search) parts.push(`searched ${counts.search} pattern${counts.search > 1 ? 's' : ''}`);
  if (counts.list_files)
    parts.push(`listed ${counts.list_files} dir${counts.list_files > 1 ? 's' : ''}`);
  if (counts.web_search)
    parts.push(`web searched ${counts.web_search} quer${counts.web_search > 1 ? 'ies' : 'y'}`);
  if (counts.web_fetch)
    parts.push(`fetched ${counts.web_fetch} URL${counts.web_fetch > 1 ? 's' : ''}`);
  if (counts.task) parts.push(`ran ${counts.task} sub-task${counts.task > 1 ? 's' : ''}`);
  const countedTypes = new Set([
    'read_file',
    'write_file',
    'edit_file',
    'bash',
    'search',
    'list_files',
    'web_search',
    'web_fetch',
    'task',
  ]);
  let other = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (!countedTypes.has(key)) other += count;
  }
  if (other > 0) parts.push(`${other} other`);
  return parts.join(', ') || `${toolRun.length} steps`;
}
