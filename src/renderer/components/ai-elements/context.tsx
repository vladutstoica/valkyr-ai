import type { LanguageModelUsage } from 'ai';
import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { createContext, useContext, useMemo } from 'react';

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  /** Per-category token breakdown (input, output, reasoning, cached). */
  usage?: LanguageModelUsage;
  /** Pre-computed cost from the agent (avoids needing tokenlens). */
  cost?: { amount: number; currency: string };
}

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
  const context = useContext(ContextContext);

  if (!context) {
    throw new Error('Context components must be used within Context');
  }

  return context;
};

/** Format a token count with compact notation (e.g. 1.2K, 3.5M). */
function formatTokens(tokens: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(tokens);
}

// ── Root ──

export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

export const Context = ({ usedTokens, maxTokens, usage, cost, ...props }: ContextProps) => {
  const contextValue = useMemo(
    () => ({ maxTokens, usage, cost, usedTokens }),
    [maxTokens, usage, cost, usedTokens]
  );

  return (
    <ContextContext.Provider value={contextValue}>
      <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextContext.Provider>
  );
};

// ── Circular progress icon ──

const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const dashOffset = circumference * (1 - usedPercent);

  return (
    <svg
      aria-label="Model context usage"
      height="16"
      role="img"
      style={{ color: 'currentcolor' }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="16"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
    </svg>
  );
};

// ── Trigger (compact button) ──

export type ContextTriggerProps = ComponentProps<typeof Button>;

export const ContextTrigger = ({ children, ...props }: ContextTriggerProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const renderedPercent = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(usedPercent);

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6 gap-1 px-1.5 text-[10px]"
          {...props}
        >
          <ContextIcon />
          <span className="font-medium tabular-nums">{renderedPercent}</span>
        </Button>
      )}
    </HoverCardTrigger>
  );
};

// ── Hover card content wrapper ──

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({ className, ...props }: ContextContentProps) => (
  <HoverCardContent className={cn('min-w-52 divide-y overflow-hidden p-0', className)} {...props} />
);

// ── Header (progress bar + token counts) ──

export type ContextContentHeaderProps = ComponentProps<'div'>;

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const displayPct = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(usedPercent);

  return (
    <div className={cn('w-full space-y-2 p-3', className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>Context window</p>
            <p className="text-muted-foreground font-mono">
              {formatTokens(usedTokens)} / {formatTokens(maxTokens)}
            </p>
          </div>
          <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
          <p className="text-muted-foreground text-right text-[10px]">{displayPct} used</p>
        </>
      )}
    </div>
  );
};

// ── Body (per-category usage rows) ──

export type ContextContentBodyProps = ComponentProps<'div'>;

export const ContextContentBody = ({ children, className, ...props }: ContextContentBodyProps) => {
  const { usage } = useContextValue();

  // Hide the body section entirely when no per-category data is available
  if (!usage && !children) return null;

  return (
    <div className={cn('w-full space-y-1 p-3', className)} {...props}>
      {children}
    </div>
  );
};

// ── Individual usage rows ──

const TokenRow = ({ label, tokens }: { label: string; tokens: number }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{formatTokens(tokens)}</span>
  </div>
);

export type ContextInputUsageProps = ComponentProps<'div'>;

export const ContextInputUsage = ({ className, children, ...props }: ContextInputUsageProps) => {
  const { usage } = useContextValue();
  const tokens = usage?.inputTokens;
  if (children)
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  if (!tokens) return null;
  return <TokenRow label="Input" tokens={tokens} />;
};

export type ContextOutputUsageProps = ComponentProps<'div'>;

export const ContextOutputUsage = ({ className, children, ...props }: ContextOutputUsageProps) => {
  const { usage } = useContextValue();
  const tokens = usage?.outputTokens;
  if (children)
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  if (!tokens) return null;
  return <TokenRow label="Output" tokens={tokens} />;
};

export type ContextReasoningUsageProps = ComponentProps<'div'>;

export const ContextReasoningUsage = ({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) => {
  const { usage } = useContextValue();
  const tokens = usage?.outputTokenDetails?.reasoningTokens;
  if (children)
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  if (!tokens) return null;
  return <TokenRow label="Reasoning" tokens={tokens} />;
};

export type ContextCacheUsageProps = ComponentProps<'div'>;

export const ContextCacheUsage = ({ className, children, ...props }: ContextCacheUsageProps) => {
  const { usage } = useContextValue();
  const tokens = usage?.inputTokenDetails?.cacheReadTokens;
  if (children)
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  if (!tokens) return null;
  return <TokenRow label="Cache" tokens={tokens} />;
};

// ── Footer (cost) ──

export type ContextContentFooterProps = ComponentProps<'div'>;

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => {
  const { cost } = useContextValue();

  if (!cost && !children) return null;

  const totalCost = cost
    ? new Intl.NumberFormat('en-US', {
        currency: cost.currency || 'USD',
        style: 'currency',
        minimumFractionDigits: 4,
      }).format(cost.amount)
    : null;

  return (
    <div
      className={cn(
        'bg-secondary flex w-full items-center justify-between gap-3 p-3 text-xs',
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <span className="text-muted-foreground">Session cost</span>
          <span className="tabular-nums">{totalCost}</span>
        </>
      )}
    </div>
  );
};
