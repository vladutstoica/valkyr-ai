import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ToolUIPart } from 'ai';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  Loader2Icon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useState, isValidElement } from 'react';
import { CodeBlock } from './code-block';

// ── Expandable Tool (has input/output content) ──

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn('group/tool not-prose mb-2 w-full rounded-md border', className)}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  subtitle?: string;
  type: ToolUIPart['type'];
  state: ToolUIPart['state'];
  icon?: LucideIcon;
  className?: string;
};

const statusConfig: Record<string, { label: string; icon: ReactNode }> = {
  'input-streaming': {
    label: 'Pending',
    icon: <CircleIcon className="text-muted-foreground size-3" />,
  },
  'input-available': {
    label: 'Running',
    icon: <Loader2Icon className="size-3 animate-spin" />,
  },
  'output-available': {
    label: 'Completed',
    icon: <CheckCircleIcon className="size-3 text-green-600" />,
  },
  'output-error': {
    label: 'Error',
    icon: <XCircleIcon className="size-3 text-red-600" />,
  },
  'output-denied': {
    label: 'Denied',
    icon: <XCircleIcon className="size-3 text-orange-600" />,
  },
  'approval-requested': {
    label: 'Awaiting Approval',
    icon: <ClockIcon className="size-3 text-yellow-600" />,
  },
  'approval-responded': {
    label: 'Responded',
    icon: <CheckCircleIcon className="size-3 text-blue-600" />,
  },
};

export const ToolHeader = ({
  className,
  title,
  subtitle,
  type,
  state,
  icon: Icon = WrenchIcon,
}: ToolHeaderProps) => {
  const status = statusConfig[state];

  return (
    <CollapsibleTrigger
      className={cn('flex w-full items-center justify-between gap-3 px-3 py-2', className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate text-sm font-medium">
          {title ?? type.split('-').slice(1).join('-')}
        </span>
        {subtitle && <span className="text-muted-foreground/60 shrink-0 text-xs">{subtitle}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            {status.icon}
            <span className="hidden sm:inline">{status.label}</span>
          </span>
        )}
        <ChevronDownIcon className="text-muted-foreground size-4 transition-transform duration-200 group-data-[state=open]/tool:rotate-180" />
      </div>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent className={cn('border-t px-3 pb-3', className)} {...props} />
);

export type ToolInputProps = ComponentProps<'div'> & {
  input: ToolUIPart['input'];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const isEmpty = !input || (typeof input === 'object' && Object.keys(input).length === 0);
  if (isEmpty) return null;

  return (
    <div className={cn('space-y-1.5 overflow-hidden pt-3', className)} {...props}>
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Parameters
      </h4>
      <div className="bg-muted/50 rounded-md">
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
    <div className={cn('space-y-1.5 pt-3', className)} {...props}>
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {errorText ? 'Error' : 'Result'}
      </h4>
      <div
        className={cn(
          'overflow-x-auto rounded-md text-xs [&_table]:w-full',
          errorText ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-foreground'
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
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={cn('mb-0.5', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-1.5 py-0.5 text-xs transition-colors"
      >
        <ChevronDownIcon
          className={cn(
            'size-3 shrink-0 -rotate-90 transition-transform duration-200',
            expanded && 'rotate-0'
          )}
        />
        <WrenchIcon className="size-3 shrink-0" />
        <span>Used {count} tools</span>
      </button>
      {expanded && <div className="border-border/40 ml-3 border-l pl-1">{children}</div>}
    </div>
  );
};
