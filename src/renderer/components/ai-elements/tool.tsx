import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ToolUIPart } from 'ai';
import type { LucideIcon } from 'lucide-react';
import { ChevronRightIcon, Loader2Icon, XCircleIcon, WrenchIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useState, isValidElement } from 'react';
import { CodeBlock } from './code-block';

// ── Expandable Tool (has input/output content) ──

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn('group/tool not-prose mb-0.5 w-full', className)} {...props} />
);

export type ToolHeaderProps = {
  title?: string;
  subtitle?: string;
  type: ToolUIPart['type'];
  state: ToolUIPart['state'];
  icon?: LucideIcon;
  className?: string;
};

export const ToolHeader = ({
  className,
  title,
  subtitle,
  type,
  state,
  icon: Icon = WrenchIcon,
}: ToolHeaderProps) => {
  const isRunning = state === 'input-available' || state === 'input-streaming';
  const isError = state === 'output-error' || state === 'output-denied';

  return (
    <CollapsibleTrigger
      className={cn(
        'text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors',
        isError && 'text-red-500',
        className
      )}
    >
      <ChevronRightIcon className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/tool:rotate-90" />
      {isRunning ? (
        <Loader2Icon className="size-3 shrink-0 animate-spin" />
      ) : (
        <Icon className="size-3 shrink-0" />
      )}
      <span className="truncate">{title ?? type.split('-').slice(1).join('-')}</span>
      {subtitle && <span className="text-muted-foreground/50 shrink-0">{subtitle}</span>}
      {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent className={cn('border-border/40 ml-3 border-l pl-3', className)} {...props} />
);

export type ToolInputProps = ComponentProps<'div'> & {
  input: ToolUIPart['input'];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const isEmpty = !input || (typeof input === 'object' && Object.keys(input).length === 0);
  if (isEmpty) return null;

  return (
    <div className={cn('overflow-hidden pt-1 pb-2', className)} {...props}>
      <div className="bg-muted/40 rounded">
        <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<'div'> & {
  output: ToolUIPart['output'];
  errorText: ToolUIPart['errorText'];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) return null;

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === 'object' && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === 'string') {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn('pb-2', className)} {...props}>
      <div
        className={cn(
          'overflow-x-auto rounded text-xs [&_table]:w-full',
          errorText ? 'bg-destructive/10 text-destructive' : 'bg-muted/40 text-foreground'
        )}
      >
        {errorText && <div className="p-2">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};

// ── Compact Inline Tool (no expandable content) ──

export type ToolInlineProps = {
  title: string;
  state: ToolUIPart['state'];
  icon?: LucideIcon;
  className?: string;
};

export const ToolInline = ({
  title,
  state,
  icon: Icon = WrenchIcon,
  className,
}: ToolInlineProps) => {
  const isRunning = state === 'input-available' || state === 'input-streaming';
  const isError = state === 'output-error' || state === 'output-denied';

  return (
    <div
      className={cn(
        'text-muted-foreground flex items-center gap-1.5 px-1.5 py-0.5 text-xs',
        isError && 'text-red-500',
        className
      )}
    >
      {isRunning ? (
        <Loader2Icon className="size-3 shrink-0 animate-spin" />
      ) : (
        <Icon className="size-3 shrink-0" />
      )}
      <span className="truncate">{title}</span>
      {isError && <XCircleIcon className="size-3 shrink-0 text-red-500" />}
    </div>
  );
};

// ── Grouped Tools (collapse multiple consecutive tools) ──

export type ToolGroupProps = {
  children: ReactNode;
  count: number;
  className?: string;
};

export function mapToolStateToStepStatus(state: string): 'complete' | 'active' | 'pending' {
  if (state === 'output-available' || state === 'output-error' || state === 'output-denied')
    return 'complete';
  if (state === 'input-available' || state === 'input-streaming') return 'active';
  return 'pending';
}

export const ToolGroup = ({ children, count, className }: ToolGroupProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('mb-0.5', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-1.5 py-0.5 text-xs transition-colors"
      >
        <ChevronRightIcon
          className={cn(
            'size-3 shrink-0 transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
        <WrenchIcon className="size-3 shrink-0" />
        <span>Used {count} tools</span>
      </button>
      {expanded && <div className="border-border/40 ml-3 border-l pl-1">{children}</div>}
    </div>
  );
};
