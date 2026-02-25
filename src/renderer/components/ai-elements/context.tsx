import type { LanguageModelUsage } from 'ai';
import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { createContext, useContext, useMemo } from 'react';
import { getUsage } from 'tokenlens';

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

type ModelId = string;

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  /** Per-category token breakdown (input, output, reasoning, cached). */
  usage?: LanguageModelUsage;
  /** Model identifier for tokenlens cost calculation (e.g. "anthropic:claude-sonnet-4"). */
  modelId?: ModelId;
  /** Pre-computed cost from the agent — takes priority over tokenlens calculation. */
  cost?: { amount: number; currency: string };
  /** Whether the token count is a client-side estimate (not from the agent). */
  estimated?: boolean;
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

export const Context = ({
  usedTokens,
  maxTokens,
  usage,
  modelId,
  cost,
  estimated,
  ...props
}: ContextProps) => {
  const contextValue = useMemo(
    () => ({ maxTokens, modelId, usage, cost, usedTokens, estimated }),
    [maxTokens, modelId, usage, cost, usedTokens, estimated]
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
  const { usedTokens, maxTokens, estimated } = useContextValue();
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
          {estimated && <span className="text-muted-foreground/60 text-[8px]">est.</span>}
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
  const { usedTokens, maxTokens, estimated } = useContextValue();
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
              ~{formatTokens(usedTokens)} / {formatTokens(maxTokens)}
            </p>
          </div>
          <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
          <p className="text-muted-foreground text-right text-[10px]">{displayPct} used</p>
          {estimated && (
            <p className="text-muted-foreground/50 text-[9px]">
              * Client-side estimate — may differ from actual agent context
            </p>
          )}
        </>
      )}
    </div>
  );
};

// ── Body (per-category usage rows) ──

export type ContextContentBodyProps = ComponentProps<'div'>;

export const ContextContentBody = ({ children, className, ...props }: ContextContentBodyProps) => (
  <div className={cn('w-full space-y-1 p-3', className)} {...props}>
    {children}
  </div>
);

// ── Tokens with cost helper ──

const TokensWithCost = ({ tokens, costText }: { tokens?: number; costText?: string }) => (
  <span>
    {tokens === undefined
      ? '\u2014'
      : new Intl.NumberFormat('en-US', { notation: 'compact' }).format(tokens)}
    {costText ? <span className="text-muted-foreground ml-2">\u2022 {costText}</span> : null}
  </span>
);

// ── Individual usage rows ──

export type ContextInputUsageProps = ComponentProps<'div'>;

export const ContextInputUsage = ({ className, children, ...props }: ContextInputUsageProps) => {
  const { usage, modelId } = useContextValue();
  const inputTokens = usage?.inputTokens ?? 0;

  if (children) return children;
  if (!inputTokens) return null;

  const inputCost = modelId
    ? getUsage({ modelId, usage: { input: inputTokens, output: 0 } }).costUSD?.totalUSD
    : undefined;
  const inputCostText = inputCost
    ? new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(inputCost)
    : undefined;

  return (
    <div className={cn('flex items-center justify-between text-xs', className)} {...props}>
      <span className="text-muted-foreground">Input</span>
      <TokensWithCost costText={inputCostText} tokens={inputTokens} />
    </div>
  );
};

export type ContextOutputUsageProps = ComponentProps<'div'>;

export const ContextOutputUsage = ({ className, children, ...props }: ContextOutputUsageProps) => {
  const { usage, modelId } = useContextValue();
  const outputTokens = usage?.outputTokens ?? 0;

  if (children) return children;
  if (!outputTokens) return null;

  const outputCost = modelId
    ? getUsage({ modelId, usage: { input: 0, output: outputTokens } }).costUSD?.totalUSD
    : undefined;
  const outputCostText = outputCost
    ? new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(outputCost)
    : undefined;

  return (
    <div className={cn('flex items-center justify-between text-xs', className)} {...props}>
      <span className="text-muted-foreground">Output</span>
      <TokensWithCost costText={outputCostText} tokens={outputTokens} />
    </div>
  );
};

export type ContextReasoningUsageProps = ComponentProps<'div'>;

export const ContextReasoningUsage = ({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) => {
  const { usage, modelId } = useContextValue();
  const reasoningTokens = usage?.reasoningTokens ?? 0;

  if (children) return children;
  if (!reasoningTokens) return null;

  const reasoningCost = modelId
    ? getUsage({ modelId, usage: { reasoningTokens } }).costUSD?.totalUSD
    : undefined;
  const reasoningCostText = reasoningCost
    ? new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(reasoningCost)
    : undefined;

  return (
    <div className={cn('flex items-center justify-between text-xs', className)} {...props}>
      <span className="text-muted-foreground">Reasoning</span>
      <TokensWithCost costText={reasoningCostText} tokens={reasoningTokens} />
    </div>
  );
};

export type ContextCacheUsageProps = ComponentProps<'div'>;

export const ContextCacheUsage = ({ className, children, ...props }: ContextCacheUsageProps) => {
  const { usage, modelId } = useContextValue();
  const cacheTokens = usage?.cachedInputTokens ?? 0;

  if (children) return children;
  if (!cacheTokens) return null;

  const cacheCost = modelId
    ? getUsage({ modelId, usage: { cacheReads: cacheTokens, input: 0, output: 0 } }).costUSD
        ?.totalUSD
    : undefined;
  const cacheCostText = cacheCost
    ? new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cacheCost)
    : undefined;

  return (
    <div className={cn('flex items-center justify-between text-xs', className)} {...props}>
      <span className="text-muted-foreground">Cache</span>
      <TokensWithCost costText={cacheCostText} tokens={cacheTokens} />
    </div>
  );
};

// ── Footer (cost) ──

export type ContextContentFooterProps = ComponentProps<'div'>;

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => {
  const { cost, modelId, usage } = useContextValue();

  // Priority: agent-provided cost > tokenlens calculation
  let totalCost: string | null = null;
  let isEstimatedCost = false;

  if (cost) {
    totalCost = new Intl.NumberFormat('en-US', {
      currency: cost.currency || 'USD',
      style: 'currency',
      minimumFractionDigits: 4,
    }).format(cost.amount);
  } else if (modelId) {
    const computed = getUsage({
      modelId,
      usage: {
        input: usage?.inputTokens ?? 0,
        output: usage?.outputTokens ?? 0,
      },
    }).costUSD?.totalUSD;
    if (computed != null) {
      totalCost = new Intl.NumberFormat('en-US', {
        currency: 'USD',
        style: 'currency',
        minimumFractionDigits: 4,
      }).format(computed);
      isEstimatedCost = true;
    }
  }

  if (!totalCost && !children) return null;

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
          <span className="text-muted-foreground">
            Session cost{isEstimatedCost ? ' (est.)' : ''}
          </span>
          <span className="tabular-nums">{totalCost}</span>
        </>
      )}
    </div>
  );
};
