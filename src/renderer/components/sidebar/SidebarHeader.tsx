import React from 'react';
import { Settings } from 'lucide-react';

interface SidebarHeaderProps {
  onOpenSettings?: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onOpenSettings }) => (
  <div className="flex shrink-0 items-center justify-between py-1">
    <span className="text-foreground text-xs font-semibold tracking-wider uppercase">
      Valkyr AI
    </span>
    {onOpenSettings && (
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
        onClick={onOpenSettings}
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    )}
  </div>
);
