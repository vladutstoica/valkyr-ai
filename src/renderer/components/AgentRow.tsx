import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface AgentRowProps {
  icon: LucideIcon;
  label: string;
  detail?: string | null;
  middle: React.ReactNode;
  right: React.ReactNode;
}

const AgentRow: React.FC<AgentRowProps> = ({ icon: Icon, label, detail, middle, right }) => {
  return (
    <div className="border-border/60 bg-background hover:bg-muted/40 grid grid-cols-12 items-center gap-4 rounded-xl border px-4 py-3 transition">
      <div className="col-span-12 flex items-center gap-3 sm:col-span-4">
        <span className="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">{label}</p>
          {detail ? <p className="text-muted-foreground truncate text-xs">{detail}</p> : null}
        </div>
      </div>
      <div className="col-span-12 sm:col-span-5">{middle}</div>
      <div className="col-span-12 flex items-center justify-end gap-2 sm:col-span-3">{right}</div>
    </div>
  );
};

export default AgentRow;
