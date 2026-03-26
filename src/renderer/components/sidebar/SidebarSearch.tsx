import React from 'react';
import { Search } from 'lucide-react';

interface SidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({ value, onChange, inputRef }) => (
  <div className="shrink-0 py-2">
    <div className="border-border bg-background flex items-center gap-2 rounded-md border px-2 py-1.5">
      <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search sessions..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-xs outline-none"
      />
    </div>
  </div>
);
