'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ListTodoIcon, ChevronDownIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
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

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
};

export const Plan = ({ className, isStreaming = false, children, ...props }: PlanProps) => (
  <PlanContext.Provider value={{ isStreaming }}>
    <Collapsible className={cn('not-prose mb-2', className)} data-slot="plan" {...props}>
      {children}
    </Collapsible>
  </PlanContext.Provider>
);

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  completed?: number;
  total?: number;
};

export const PlanTrigger = ({ className, completed, total, ...props }: PlanTriggerProps) => {
  const { isStreaming } = usePlan();
  const hasProgress = typeof completed === 'number' && typeof total === 'number';

  return (
    <CollapsibleTrigger
      className={cn(
        'group text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-sm transition-colors',
        className
      )}
      data-slot="plan-trigger"
      {...props}
    >
      <ListTodoIcon className="size-4 shrink-0" />
      <span className="flex items-center gap-1.5">
        {isStreaming ? <Shimmer duration={1}>Planning...</Shimmer> : 'Plan'}
        {hasProgress && (
          <span className="text-muted-foreground/70 text-xs">
            ({completed}/{total})
          </span>
        )}
      </span>
      <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type PlanContentProps = ComponentProps<typeof CollapsibleContent>;

export const PlanContent = ({ className, ...props }: PlanContentProps) => (
  <CollapsibleContent
    className={cn(
      'border-border mt-2 ml-6 border-l pl-3',
      'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in outline-none',
      className
    )}
    data-slot="plan-content"
    {...props}
  />
);

// Keep legacy exports for backward compat (unused but prevents import errors)
export const PlanHeader = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const PlanTitle = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const PlanFooter = ({ children }: { children?: ReactNode }) => <>{children}</>;
