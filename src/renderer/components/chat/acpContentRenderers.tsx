import React from 'react';
import type { BundledLanguage } from 'shiki';
import { getAcpMeta, type AcpToolMetadata } from '../../lib/acpChatTransport';
import { getLanguageFromPath, normalizeFromKind, normalizeToolName } from '../../lib/toolRenderer';
import { extractFilePath } from './acpChatUtils';
import { CodeBlockContent } from '../ai-elements/code-block';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationSource,
} from '../ai-elements/inline-citation';

/**
 * Render ACP content items (diffs, text blocks, images, terminals).
 */
export function renderAcpContent(
  acpContent: NonNullable<AcpToolMetadata['content']>
): React.ReactNode | null {
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < acpContent.length; i++) {
    const item = acpContent[i];

    if (item.type === 'diff') {
      const language = getLanguageFromPath(item.path) as BundledLanguage;
      elements.push(
        <div key={`diff-${i}`} className="space-y-0 overflow-hidden pt-1 pb-2">
          <div className="text-muted-foreground mb-1 truncate font-mono text-[10px]">
            {item.path}
          </div>
          {item.oldText && (
            <div className="overflow-hidden rounded-t border border-red-500/20 bg-red-500/5">
              <CodeBlockContent code={item.oldText} language={language} showLineNumbers />
            </div>
          )}
          {item.newText && (
            <div
              className={`overflow-hidden border border-green-500/20 bg-green-500/5 ${item.oldText ? 'rounded-b border-t-0' : 'rounded'}`}
            >
              <CodeBlockContent code={item.newText} language={language} showLineNumbers />
            </div>
          )}
        </div>
      );
    } else if (item.type === 'content') {
      const inner = item.content;
      if (inner.type === 'text' && inner.text) {
        elements.push(
          <div key={`content-${i}`} className="overflow-hidden pt-1 pb-2">
            <pre className="text-muted-foreground/70 bg-muted/30 max-h-40 overflow-auto rounded p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
              {inner.text.slice(0, 2000)}
              {inner.text.length > 2000 ? '...' : ''}
            </pre>
          </div>
        );
      } else if (inner.type === 'image' && inner.data && inner.mimeType) {
        elements.push(
          <div key={`content-${i}`} className="overflow-hidden pt-1 pb-2">
            <img
              src={`data:${inner.mimeType};base64,${inner.data}`}
              alt=""
              className="max-h-64 rounded-md border object-contain"
            />
          </div>
        );
      }
    } else if (item.type === 'terminal') {
      elements.push(
        <div key={`terminal-${i}`} className="overflow-hidden pt-1 pb-2">
          <div className="text-muted-foreground/50 rounded bg-zinc-950 p-2 font-mono text-[10px]">
            Terminal: {item.terminalId}
          </div>
        </div>
      );
    }
  }

  return elements.length > 0 ? <>{elements}</> : null;
}

/**
 * Render ACP file locations as small pills.
 */
export function renderAcpLocations(
  locations: NonNullable<AcpToolMetadata['locations']>
): React.ReactNode | null {
  if (locations.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1 pb-1">
      {locations.map((loc, i) => {
        const filename = loc.path.split('/').pop() || loc.path;
        const label = loc.line ? `${filename}:${loc.line}` : filename;
        return (
          <span
            key={i}
            className="bg-muted text-muted-foreground inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px]"
            title={loc.line ? `${loc.path}:${loc.line}` : loc.path}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Render smart content for a tool's expandable area inside <ToolContent>.
 * Returns syntax-highlighted code blocks, terminal output, match lists, etc.
 * Falls back to null if there's nothing meaningful to show.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderToolContent(toolPart: any): React.ReactNode | null {
  const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
  const contentAcpMeta = getAcpMeta(toolPart);
  const contentAcpKind = contentAcpMeta?.kind;
  const normalized = contentAcpKind
    ? normalizeFromKind(contentAcpKind)
    : normalizeToolName(toolName);
  const inputObj = toolPart.input || {};
  const output = toolPart.output != null ? String(toolPart.output) : '';
  const filePath = extractFilePath(inputObj);

  // Prefer ACP structured content when available (diffs, text blocks, terminals)
  if (contentAcpMeta?.content?.length) {
    const acpRendered = renderAcpContent(contentAcpMeta.content);
    if (acpRendered) return acpRendered;
  }

  switch (normalized) {
    case 'read_file': {
      if (!output || !filePath) return null;
      const language = getLanguageFromPath(filePath) as BundledLanguage;
      const offset = typeof inputObj.offset === 'number' ? inputObj.offset : null;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <div className="bg-muted/40 overflow-hidden rounded">
            <CodeBlockContent
              code={output}
              language={language}
              showLineNumbers
              lineNumberOffset={offset ? offset - 1 : 0}
            />
          </div>
        </div>
      );
    }

    case 'write_file': {
      const content = typeof inputObj.content === 'string' ? inputObj.content : '';
      if (!content || !filePath) return null;
      const language = getLanguageFromPath(filePath) as BundledLanguage;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <div className="overflow-hidden rounded border border-green-500/20 bg-green-500/5">
            <CodeBlockContent code={content} language={language} showLineNumbers />
          </div>
        </div>
      );
    }

    case 'edit_file': {
      const oldStr = typeof inputObj.old_string === 'string' ? inputObj.old_string : '';
      const newStr = typeof inputObj.new_string === 'string' ? inputObj.new_string : '';
      if (!oldStr && !newStr) return null;
      if (!filePath) return null;
      const language = getLanguageFromPath(filePath) as BundledLanguage;
      return (
        <div className="space-y-0 overflow-hidden pt-1 pb-2">
          {oldStr && (
            <div className="overflow-hidden rounded-t border border-red-500/20 bg-red-500/5">
              <CodeBlockContent code={oldStr} language={language} showLineNumbers />
            </div>
          )}
          {newStr && (
            <div
              className={`overflow-hidden border border-green-500/20 bg-green-500/5 ${oldStr ? 'rounded-b border-t-0' : 'rounded'}`}
            >
              <CodeBlockContent code={newStr} language={language} showLineNumbers />
            </div>
          )}
        </div>
      );
    }

    case 'bash': {
      if (!output) return null;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <pre className="max-h-40 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100">
            {output}
          </pre>
        </div>
      );
    }

    case 'search':
    case 'list_files': {
      if (!output) return null;
      const lines = output.split('\n').filter((l: string) => l.trim());
      if (lines.length === 0) return null;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <div className="text-muted-foreground/70 space-y-0.5 font-mono text-[10px]">
            {lines.slice(0, 8).map((line: string, idx: number) => (
              <div key={idx} className="truncate">
                {line}
              </div>
            ))}
            {lines.length > 8 && (
              <div className="text-muted-foreground/40">...and {lines.length - 8} more</div>
            )}
          </div>
        </div>
      );
    }

    case 'web_search': {
      if (!output) return null;
      const lines = output.split('\n').filter((l: string) => l.trim());
      if (lines.length === 0) return null;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <div className="text-muted-foreground/70 space-y-0.5 text-[10px]">
            {lines.slice(0, 5).map((line: string, idx: number) => (
              <div key={idx} className="truncate">
                {line}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'web_fetch': {
      if (!output) return null;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <pre className="text-muted-foreground/70 max-h-24 overflow-hidden font-mono text-[10px] leading-relaxed">
            {output.slice(0, 300)}
            {output.length > 300 ? '...' : ''}
          </pre>
        </div>
      );
    }

    case 'task': {
      if (!output) return null;
      return (
        <div className="overflow-hidden pt-1 pb-2">
          <pre className="text-muted-foreground/70 max-h-24 overflow-hidden font-mono text-[10px] leading-relaxed">
            {output.slice(0, 300)}
            {output.length > 300 ? '...' : ''}
          </pre>
        </div>
      );
    }

    default: {
      // Unknown tools — show whatever output or input we have
      if (output) {
        return (
          <div className="overflow-hidden pt-1 pb-2">
            <pre className="text-muted-foreground/70 bg-muted/30 max-h-40 overflow-auto rounded p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
              {output.slice(0, 2000)}
              {output.length > 2000 ? '...' : ''}
            </pre>
          </div>
        );
      }
      // Show raw input if no output yet
      const inputKeys = Object.keys(inputObj).filter((k) => k !== 'title');
      if (inputKeys.length > 0) {
        return (
          <div className="overflow-hidden pt-1 pb-2">
            <pre className="text-muted-foreground/50 bg-muted/30 max-h-24 overflow-auto rounded p-2 font-mono text-[10px] leading-relaxed">
              {JSON.stringify(inputObj, null, 2).slice(0, 500)}
            </pre>
          </div>
        );
      }
      return null;
    }
  }
}

/** Render text with inline citation pills when `[N]` markers and source parts exist */
export function renderTextWithCitations(
  text: string,
  sources: Array<{ type: string; url?: string; title?: string; sourceId?: string }>
) {
  // Match [1], [2], etc.
  const citationPattern = /\[(\d+)\]/g;
  if (!citationPattern.test(text) || sources.length === 0) return null;

  // Reset regex state
  citationPattern.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    // Text before the citation marker
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const citationNum = parseInt(match[1], 10);
    const source = sources[citationNum - 1]; // [1] → index 0
    if (source?.url) {
      parts.push(
        <InlineCitation key={`cite-${match.index}`}>
          <InlineCitationCard>
            <InlineCitationCardTrigger sources={[source.url]} />
            <InlineCitationCardBody>
              <InlineCitationCarousel>
                <InlineCitationCarouselContent>
                  <InlineCitationCarouselItem>
                    <InlineCitationSource
                      title={source.title || `Source ${citationNum}`}
                      url={source.url}
                    />
                  </InlineCitationCarouselItem>
                </InlineCitationCarouselContent>
              </InlineCitationCarousel>
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>
      );
    } else {
      parts.push(match[0]); // No source data — keep raw text
    }
    lastIndex = citationPattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
