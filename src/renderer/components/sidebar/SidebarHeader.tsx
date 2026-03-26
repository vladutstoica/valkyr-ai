import React from 'react';
import { Settings } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface SidebarHeaderProps {
  onOpenSettings?: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onOpenSettings }) => (
  <div className="shrink-0 pb-0">
    <Card className="w-full">
      <CardContent className="flex items-center justify-between px-3 py-2">
        <span className="text-foreground text-xs font-semibold tracking-wider uppercase">
          Valkyr AI
        </span>
        {onOpenSettings && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </CardContent>
    </Card>
  </div>
);
