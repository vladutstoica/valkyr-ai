import React, { useState } from 'react';
import {
  BotIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  Loader2Icon,
} from 'lucide-react';
import { useToolOutput } from '../../lib/toolOutputStore';

function parseSubAgentInfo(input: Record<string, unknown>): {
  agentType: string;
  description: string;
  prompt: string;
} {
  let agentType = ((input.subagent_type || '') as string).trim();
  let description = ((input.description || '') as string).trim();
  const prompt = ((input.prompt || '') as string).trim();
  const title = ((input.title || '') as string).trim();

  // If no structured data, parse from ACP title (format: "AgentType: description")
  if (!agentType && !description && title) {
    const colonIdx = title.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      agentType = title.slice(0, colonIdx).trim();
      description = title.slice(colonIdx + 1).trim();
    } else {
      description = title;
    }
  }

  return { agentType, description, prompt };
}

export function SubAgentTool({ toolCallId, toolPart }: { toolCallId: string; toolPart: any }) {
  const [expanded, setExpanded] = useState(false);
  const streamingOutput = useToolOutput(toolCallId);
  const input = toolPart.input || {};
  const { agentType, description, prompt } = parseSubAgentInfo(input);
  const isRunning = toolPart.state === 'input-available' || toolPart.state === 'input-streaming';
  const isDone = toolPart.state === 'output-available';
  const isError = toolPart.state === 'output-error' || toolPart.state === 'output-denied';
  const finalOutput = toolPart.output != null ? String(toolPart.output) : '';

  // Show streaming content while running, final output when done
  const outputText = finalOutput || streamingOutput;
  const hasOutput = outputText.length > 0;

  // Always show last 4 lines of output inline (no expand needed)
  const outputLines = outputText.split('\n').filter((l: string) => l.trim());
  const inlineLines = outputLines.slice(-4);
  const hiddenLineCount = outputLines.length - inlineLines.length;

  // If we have nothing meaningful, don't render
  if (!agentType && !description) return null;

  return (
    <div className="not-prose mb-0.5 w-full">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${isError ? 'text-red-500' : ''}`}
      >
        <ChevronRightIcon
          className={`size-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        {isRunning ? (
          <Loader2Icon className="size-3 shrink-0 animate-spin" />
        ) : (
          <BotIcon className="size-3 shrink-0" />
        )}
        {agentType && (
          <span className="bg-primary/15 text-primary shrink-0 rounded px-1 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {agentType}
          </span>
        )}
        <span className="truncate">{description}</span>
        {isRunning && (
          <span className="text-muted-foreground/50 shrink-0 text-[10px]">running</span>
        )}
        {isDone && <CheckCircleIcon className="text-muted-foreground/50 size-3 shrink-0" />}
      </button>

      {/* Output snippet — always visible when there's output */}
      {hasOutput && !expanded && (
        <div className="border-border/40 ml-6 border-l pl-3">
          {hiddenLineCount > 0 && (
            <div className="text-muted-foreground/40 text-[10px]">
              ... {hiddenLineCount} more line{hiddenLineCount > 1 ? 's' : ''}
            </div>
          )}
          <pre className="text-muted-foreground/70 max-h-20 overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {inlineLines.join('\n')}
          </pre>
        </div>
      )}

      {/* Expanded view — full prompt + full output */}
      {expanded && (
        <div className="border-border/40 ml-6 border-l pl-3">
          {prompt && (
            <div className="text-muted-foreground/70 mt-1 mb-1 max-h-24 overflow-y-auto text-[11px] leading-relaxed">
              {prompt.length > 300 ? prompt.slice(0, 300) + '...' : prompt}
            </div>
          )}
          {hasOutput && (
            <pre className="bg-muted/40 mt-1 mb-2 max-h-48 overflow-y-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap">
              {outputText.length > 2000 ? outputText.slice(-2000) : outputText}
            </pre>
          )}
          {isRunning && !hasOutput && (
            <div className="text-muted-foreground/50 flex items-center gap-1.5 py-1 text-[11px]">
              <Loader2Icon className="size-3 animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
