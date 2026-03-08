import React from 'react';
import { Loader2 } from 'lucide-react';
import { getAcpMeta } from '../../lib/acpChatTransport';
import {
  getToolDisplayLabel,
  getToolStepLabel,
  getToolIconComponent,
  normalizeToolName,
  normalizeFromKind,
} from '../../lib/toolRenderer';
import { extractBashCommand, computeDiffStats, summarizeToolRun, STACK_TRACE_PATTERN } from './acpChatUtils';
import { renderToolContent, renderAcpLocations } from './acpContentRenderers';
import { ToolRunMiniIcons } from './ToolRunMiniIcons';
import { StreamingTerminal } from './StreamingTerminal';
import { SubAgentTool } from './SubAgentTool';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  ToolInline,
  mapToolStateToStepStatus,
} from '../ai-elements/tool';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '../ai-elements/chain-of-thought';
import {
  StackTrace,
  StackTraceHeader,
  StackTraceError,
  StackTraceErrorType,
  StackTraceErrorMessage,
  StackTraceActions,
  StackTraceCopyButton,
  StackTraceExpandButton,
  StackTraceContent,
  StackTraceFrames,
} from '../ai-elements/stack-trace';

/**
 * Rich tool part renderer.
 * Handles all tool types with the <Tool> collapsible shell and smart content inside.
 * Returns a React element, or null if there's not enough data to render.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderRichToolPart(
  toolPart: any,
  i: number,
  sessionKey?: string | null
): React.ReactNode | null {
  const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';
  const acpMeta = getAcpMeta(toolPart);
  const acpKind = acpMeta?.kind;
  const acpTitle: string | undefined = toolPart.title;
  // Use ACP kind for normalization when available (more reliable than guessing from toolName)
  const normalized = acpKind ? normalizeFromKind(acpKind) : normalizeToolName(toolName);
  const output = toolPart.output != null ? String(toolPart.output) : '';
  const errorText = toolPart.errorText || '';
  const inputObj = toolPart.input || {};
  const key = toolPart.toolCallId || i;
  const isStreaming = toolPart.state === 'partial-call' || toolPart.state === 'call';

  // ── 1. Bash/shell — uses StreamingTerminal (its own rich component) ──
  if (normalized === 'bash') {
    const command = extractBashCommand(inputObj);

    // If we have output or are streaming, use the full terminal
    if (output || isStreaming) {
      return (
        <StreamingTerminal
          key={key}
          toolCallId={toolPart.toolCallId || `tool-${i}`}
          command={command}
          finalOutput={output}
          isStreaming={isStreaming}
          sessionKey={sessionKey ?? null}
        />
      );
    }

    // No output yet — use Tool shell with command preview
    const title = getToolDisplayLabel(toolName, inputObj, acpTitle);
    const Icon = getToolIconComponent(toolName, acpKind);
    return (
      <Tool key={key} defaultOpen>
        <ToolHeader title={title} type={toolPart.type} state={toolPart.state} icon={Icon} />
        <ToolContent>
          <div className="overflow-hidden pt-1 pb-2">
            <code className="bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
              $ {command.length > 100 ? command.slice(0, 100) + '...' : command}
            </code>
          </div>
          {errorText && (
            <pre className="max-h-16 overflow-hidden font-mono text-[11px] whitespace-pre-wrap text-red-500">
              {errorText.slice(0, 300)}
            </pre>
          )}
        </ToolContent>
      </Tool>
    );
  }

  // ── 2. Error text with stack traces ──
  if (errorText && STACK_TRACE_PATTERN.test(errorText)) {
    return (
      <StackTrace key={key} trace={errorText} defaultOpen>
        <StackTraceHeader>
          <StackTraceError>
            <StackTraceErrorType />
            <StackTraceErrorMessage />
          </StackTraceError>
          <StackTraceActions>
            <StackTraceCopyButton />
            <StackTraceExpandButton />
          </StackTraceActions>
        </StackTraceHeader>
        <StackTraceContent>
          <StackTraceFrames />
        </StackTraceContent>
      </StackTrace>
    );
  }

  // ── 3. Task / sub-agent — uses its own component ──
  if (normalized === 'task') {
    return (
      <SubAgentTool key={key} toolCallId={toolPart.toolCallId || `tool-${i}`} toolPart={toolPart} />
    );
  }

  // ── 4. All other tools — use <Tool> shell with smart content ──
  const title = getToolDisplayLabel(toolName, inputObj, acpTitle);
  const Icon = getToolIconComponent(toolName, acpKind);

  // Build subtitle hint
  let subtitle: string | undefined;
  if (output) {
    if (normalized === 'read_file') {
      const lineCount = output.split('\n').length;
      if (lineCount > 1) subtitle = `${lineCount} lines`;
    } else if (normalized === 'write_file') {
      const content = typeof inputObj.content === 'string' ? inputObj.content : '';
      const lineCount = content ? content.split('\n').length : 0;
      if (lineCount > 0) subtitle = `+${lineCount} lines`;
    } else if (normalized === 'edit_file') {
      const diffStats = computeDiffStats(inputObj);
      if (diffStats) subtitle = `+${diffStats.added} -${diffStats.removed}`;
    } else if (normalized === 'search') {
      const matchCount = output.split('\n').filter((l: string) => l.trim()).length;
      if (matchCount > 0) subtitle = `${matchCount} match${matchCount > 1 ? 'es' : ''}`;
    } else if (normalized === 'list_files') {
      const fileCount = output.split('\n').filter((l: string) => l.trim()).length;
      if (fileCount > 0) subtitle = `${fileCount} file${fileCount > 1 ? 's' : ''}`;
    }
  }

  const smartContent = renderToolContent(toolPart);
  const locationsContent = acpMeta?.locations?.length
    ? renderAcpLocations(acpMeta.locations)
    : null;
  const hasExpandableContent = !!smartContent || !!errorText || !!locationsContent;

  // No expandable content — use compact inline
  if (!hasExpandableContent) {
    return <ToolInline key={key} title={title} state={toolPart.state} icon={Icon} />;
  }

  return (
    <Tool key={key} defaultOpen>
      <ToolHeader
        title={title}
        subtitle={subtitle}
        type={toolPart.type}
        state={toolPart.state}
        icon={Icon}
      />
      <ToolContent>
        {locationsContent}
        {smartContent}
        {errorText && (
          <div className="pb-2">
            <pre className="max-h-16 overflow-hidden font-mono text-[11px] whitespace-pre-wrap text-red-500">
              {errorText.slice(0, 300)}
            </pre>
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderToolPart(toolPart: any, i: number, sessionKey?: string | null) {
  const toolName = toolPart.toolName || toolPart.type?.replace(/^tool-/, '') || '';

  // Try rich rendering first
  const rich = renderRichToolPart(toolPart, i, sessionKey);
  if (rich) return rich;

  // Fallback for unknown/MCP tools — use Tool shell with generic JSON content
  const acpMeta = getAcpMeta(toolPart);
  const title = getToolDisplayLabel(toolName, toolPart.input || {}, toolPart.title);
  const Icon = getToolIconComponent(toolName, acpMeta?.kind);

  const inputObj = toolPart.input || {};
  const hasInput = typeof inputObj === 'object' && Object.keys(inputObj).length > 0;
  const hasOutput = toolPart.output && String(toolPart.output).length > 0;
  const hasError = !!toolPart.errorText;
  const hasContent = hasInput || hasOutput || hasError;

  if (!hasContent) {
    return (
      <ToolInline key={toolPart.toolCallId || i} title={title} state={toolPart.state} icon={Icon} />
    );
  }

  return (
    <Tool key={toolPart.toolCallId || i} defaultOpen>
      <ToolHeader title={title} type={toolPart.type} state={toolPart.state} icon={Icon} />
      <ToolContent>
        <ToolInput input={inputObj} />
        <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
      </ToolContent>
    </Tool>
  );
}

export function StreamingToolGroup({
  toolRun,
  sessionKey,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolRun: Array<{ part: any; index: number }>;
  sessionKey?: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completed: Array<{ part: any; index: number }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const active: Array<{ part: any; index: number }> = [];
  for (const t of toolRun) {
    const s = t.part.state;
    if (s === 'output-available' || s === 'output-error' || s === 'output-denied') {
      completed.push(t);
    } else {
      active.push(t);
    }
  }
  return (
    <>
      <ChainOfThought key={`stg-${toolRun[0].index}`}>
        <ChainOfThoughtHeader>
          <span className="flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{toolRun.length} steps</span>
            <ToolRunMiniIcons toolRun={toolRun} />
          </span>
          <span className="text-muted-foreground/60 text-[10px]">{summarizeToolRun(toolRun)}</span>
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {completed.map((t) => {
            const toolName = t.part.toolName || t.part.type?.replace(/^tool-/, '') || '';
            const tAcpMeta = getAcpMeta(t.part);
            const label = getToolStepLabel(
              toolName,
              t.part.input || {},
              t.part.output,
              t.part.title
            );
            const Icon = getToolIconComponent(toolName, tAcpMeta?.kind);
            const status = mapToolStateToStepStatus(t.part.state);
            return (
              <ChainOfThoughtStep
                key={t.part.toolCallId || t.index}
                icon={Icon}
                label={label}
                status={status}
              >
                {renderToolContent(t.part)}
              </ChainOfThoughtStep>
            );
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
      {active.map((t) => renderToolPart(t.part, t.index, sessionKey))}
    </>
  );
}
