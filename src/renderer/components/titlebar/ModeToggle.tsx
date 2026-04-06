import React from 'react';
import { cn } from '@/lib/utils';
import { useAppMode, type AppMode } from '@/hooks/useAppMode';

const modes: { id: AppMode; label: string }[] = [
  { id: 'multi', label: 'Ultravibe' },
  { id: 'vibe', label: 'Vibe' },
  { id: 'ide', label: 'IDE' },
];

export const ModeToggle: React.FC = () => {
  const { mode, setMode } = useAppMode();

  return (
    <div className="bg-muted/80 dark:bg-muted/40 border-border/40 inline-flex items-center gap-0.5 rounded-lg border p-0.5 [-webkit-app-region:no-drag]">
      {modes.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          className={cn(
            'rounded-md px-4 py-1 text-[11px] font-medium transition-all',
            mode === id
              ? 'bg-accent text-foreground ring-border/20 shadow-sm ring-1'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default ModeToggle;
