import * as React from 'react';
import { Bot, Code, GitBranch, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabState, type TabId } from '@/hooks/useTabState';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ElementType;
  shortcut: string;
  beta?: boolean;
}

const TABS: TabConfig[] = [
  { id: 'agents', label: 'AI Agents', icon: Bot, shortcut: '1' },
  { id: 'editor', label: 'Editor', icon: Code, shortcut: '2', beta: true },
  { id: 'git', label: 'Git', icon: GitBranch, shortcut: '3', beta: true },
  { id: 'preview', label: 'Preview', icon: Globe, shortcut: '4', beta: true },
];

export function TabBar() {
  const { activeTab, setActiveTab, gitChangesCount, isAgentWorking } = useTabState();

  return (
    <div className="border-border bg-muted/30 flex h-11 items-center border-b">
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
              'group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="relative">
              <Icon className="h-4 w-4" />
              {showPulse && (
                <span className="absolute -top-1 -right-1 h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              )}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.beta && (
              <span className="bg-primary/15 text-primary rounded px-1 py-0.5 text-[9px] leading-none font-semibold tracking-wider uppercase">
                Beta
              </span>
            )}
            {showBadge && (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center px-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-foreground/15 text-foreground'
                    : 'bg-muted-foreground/20 text-muted-foreground group-hover:bg-foreground/15 group-hover:text-foreground'
                )}
              >
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
