import * as React from 'react';
import { Bot, Code, GitBranch, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabState, type TabId } from '@/hooks/useTabState';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ElementType;
  shortcut: string;
}

const TABS: TabConfig[] = [
  { id: 'agents', label: 'AI Agents', icon: Bot, shortcut: '1' },
  { id: 'editor', label: 'Editor', icon: Code, shortcut: '2' },
  { id: 'git', label: 'Git', icon: GitBranch, shortcut: '3' },
  { id: 'preview', label: 'Preview', icon: Globe, shortcut: '4' },
];

export function TabBar() {
  const { activeTab, setActiveTab, gitChangesCount, isAgentWorking } = useTabState();

  return (
    <div className="flex h-11 items-center border-b border-border bg-muted/30">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        const showBadge = tab.id === 'git' && gitChangesCount > 0;
        const showPulse = tab.id === 'agents' && isAgentWorking;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="relative">
              <Icon className="h-4 w-4" />
              {showPulse && (
                <span className="absolute -right-1 -top-1 h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              )}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
            {showBadge && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {gitChangesCount > 99 ? '99+' : gitChangesCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TabBar;
