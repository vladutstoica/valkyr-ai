import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTabState, type TabId } from '@/hooks/useTabState';

interface TabContainerProps {
  agentsContent: React.ReactNode;
  editorContent: React.ReactNode;
  gitContent: React.ReactNode;
  previewContent: React.ReactNode;
  className?: string;
}

export function TabContainer({
  agentsContent,
  editorContent,
  gitContent,
  previewContent,
  className,
}: TabContainerProps) {
  const activeTab = useTabState((state) => state.activeTab);

  return (
    <div className={cn('relative flex-1 overflow-hidden', className)}>
      <TabPanel tabId="agents" activeTab={activeTab}>
        {agentsContent}
      </TabPanel>
      <TabPanel tabId="editor" activeTab={activeTab}>
        {editorContent}
      </TabPanel>
      <TabPanel tabId="git" activeTab={activeTab}>
        {gitContent}
      </TabPanel>
      <TabPanel tabId="preview" activeTab={activeTab}>
        {previewContent}
      </TabPanel>
    </div>
  );
}

interface TabPanelProps {
  tabId: TabId;
  activeTab: TabId;
  children: React.ReactNode;
}

function TabPanel({ tabId, activeTab, children }: TabPanelProps) {
  const isActive = tabId === activeTab;
  const [hasFocus, setHasFocus] = useState(false);

  return (
    <div
      className={cn(
        'absolute inset-0 h-full w-full',
        isActive ? 'visible' : 'hidden'
      )}
      role="tabpanel"
      aria-hidden={!isActive}
      data-tab={tabId}
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHasFocus(false);
        }
      }}
    >
      {children}
      {/* Focus indicator ring */}
      {hasFocus && isActive && (
        <div
          className="pointer-events-none absolute inset-0 z-50 ring-1 ring-inset ring-white/15"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default TabContainer;
