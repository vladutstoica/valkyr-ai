'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { createContext, useContext } from 'react';
import { Shimmer } from './shimmer';

type PlanContextValue = {
  isStreaming: boolean;
};

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('Plan components must be used within Plan');
  }
  return context;
};

// ── Root ──

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
};

export const Plan = ({ className, isStreaming = false, children, ...props }: PlanProps) => (
  <PlanContext.Provider value={{ isStreaming }}>
    <Collapsible className={cn('not-prose', className)} data-slot="plan" {...props}>
      {children}
    </Collapsible>
  </PlanContext.Provider>
);

// ── Header ──

export type PlanHeaderProps = ComponentProps<'div'>;

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
  <div
    className={cn('flex items-start justify-between gap-3', className)}
    data-slot="plan-header"
    {...props}
  />
);

// ── Title ──

export type PlanTitleProps = ComponentProps<'h3'>;

export const PlanTitle = ({ className, children, ...props }: PlanTitleProps) => {
  const { isStreaming } = usePlan();

  return (
    <h3 className={cn('text-sm font-semibold', className)} data-slot="plan-title" {...props}>
      {isStreaming && typeof children === 'string' ? (
        <Shimmer duration={1}>{children}</Shimmer>
      ) : (
        children
      )}
    </h3>
  );
};

// ── Description ──

export type PlanDescriptionProps = ComponentProps<'p'>;

export const PlanDescription = ({ className, children, ...props }: PlanDescriptionProps) => {
  const { isStreaming } = usePlan();

  return (
    <p
      className={cn('text-muted-foreground text-xs', className)}
      data-slot="plan-description"
      {...props}
    >
      {isStreaming && typeof children === 'string' ? (
        <Shimmer duration={1}>{children}</Shimmer>
      ) : (
        children
      )}
    </p>
  );
};

// ── Trigger ──

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanTrigger = ({ className, ...props }: PlanTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      'text-muted-foreground hover:text-foreground group shrink-0 rounded-md p-1 transition-colors',
      className
    )}
    data-slot="plan-trigger"
    {...props}
  >
    <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

// ── Content ──

export type PlanContentProps = ComponentProps<typeof CollapsibleContent>;

export const PlanContent = ({ className, ...props }: PlanContentProps) => (
  <CollapsibleContent
    className={cn(
      'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in outline-none',
      className
    )}
    data-slot="plan-content"
    {...props}
  />
);

// ── Footer ──

export type PlanFooterProps = ComponentProps<'div'>;

export const PlanFooter = ({ className, ...props }: PlanFooterProps) => (
  <div
    className={cn('flex items-center gap-2 pt-2', className)}
    data-slot="plan-footer"
    {...props}
  />
);

// ── Action ──

export type PlanActionProps = ComponentProps<typeof Slot>;

export const PlanAction = (props: PlanActionProps) => <Slot {...props} />;
