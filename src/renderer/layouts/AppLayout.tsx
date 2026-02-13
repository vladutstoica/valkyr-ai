import React, { useMemo } from 'react';
import { TabBar } from '@/components/navigation/TabBar';
import { TabContainer } from '@/components/tabs/TabContainer';
import { EditorTab } from '@/components/tabs/EditorTab';
import { GitTab } from '@/components/tabs/GitTab';
import { PreviewTab } from '@/components/tabs/PreviewTab';
import { StatusBar } from '@/components/navigation/StatusBar';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useTabState } from '@/hooks/useTabState';
import { useFileChanges } from '@/hooks/useFileChanges';
import type { Project, Task } from '@/types/app';
import type { Agent } from '@/types';

// Layout dimensions
const TITLEBAR_HEIGHT = '36px';
const STATUS_BAR_HEIGHT = '24px';

interface AppLayoutProps {
  /** Left sidebar content (sessions list) */
  leftSidebar: React.ReactNode;
  /** Content for the AI Agents tab */
  agentsContent: React.ReactNode;
  /** Currently selected project */
  selectedProject: Project | null;
  /** Currently active task */
  activeTask: Task | null;
  /** Active agent for the task */
  activeTaskAgent: Agent | null;
  /** Project's default branch */
  projectDefaultBranch: string;
  /** Whether to show the left sidebar */
  showLeftSidebar?: boolean;
  /** Whether in editor mode (hides left sidebar) */
  showEditorMode?: boolean;
  /** Titlebar component */
  titlebar?: React.ReactNode;
  /** Whether the titlebar is shown */
  showTitlebar?: boolean;
  /** Callback when changes count updates */
  onChangesClick?: () => void;
  /** Callback when agent status clicked */
  onAgentClick?: () => void;
  /** Callback when branch clicked */
  onBranchClick?: () => void;
}

/**
 * Main application layout with tabbed interface
 *
 * Layout structure:
 * ┌─────────────────────────────────────────────────────────┐
 * │  Titlebar (36px)                                        │
 * ├────────────┬────────────────────────────────────────────┤
 * │            │  [AI Agents] [Editor] [Git] [Preview]      │
 * │  Left      ├────────────────────────────────────────────┤
 * │  Sidebar   │                                            │
 * │  (280px)   │       Tab Content                          │
 * │  fixed     │       (changes based on active tab)        │
 * │            │                                            │
 * │  Sessions  ├────────────────────────────────────────────┤
 * │  list      │  Terminal Panel (collapsible)              │
 * ├────────────┴────────────────────────────────────────────┤
 * │  Status Bar (24px)                                      │
 * └─────────────────────────────────────────────────────────┘
 */
export function AppLayout({
  leftSidebar,
  agentsContent,
  selectedProject,
  activeTask,
  activeTaskAgent,
  projectDefaultBranch,
  showLeftSidebar = true,
  showEditorMode = false,
  titlebar,
  showTitlebar = true,
  onChangesClick,
  onAgentClick,
  onBranchClick,
}: AppLayoutProps) {
  // Register keyboard navigation for tabs (Cmd+1/2/3/4)
  useKeyboardNavigation();

  // Get tab state for navigation
  const setActiveTab = useTabState((state) => state.setActiveTab);

  // Get worktree/task path for components
  const taskPath = activeTask?.path ?? undefined;
  const taskId = activeTask?.id ?? undefined;

  // Get file changes for git badge
  const { fileChanges } = useFileChanges(taskPath);

  // Derive status bar data from current state
  const statusBarData = useMemo(() => {
    const agentName = activeTaskAgent
      ? String(activeTaskAgent).charAt(0).toUpperCase() + String(activeTaskAgent).slice(1)
      : 'No Agent';

    // Get branch info from task or project
    const baseBranch = projectDefaultBranch || 'main';
    const currentBranch = activeTask?.branch || selectedProject?.gitInfo?.branch || baseBranch;

    // Calculate worktree info
    const worktreePath = activeTask?.path || selectedProject?.path || '';
    const worktreeId = activeTask?.id || selectedProject?.id || '';

    return {
      agentName,
      agentStatus: 'idle' as const, // TODO: Connect to actual agent status
      baseBranch,
      currentBranch,
      commitsBehind: 0, // TODO: Calculate from git state
      commitsAhead: 0, // TODO: Calculate from git state
      changesCount: fileChanges.length,
      worktreeId,
      worktreePath,
    };
  }, [activeTask, activeTaskAgent, selectedProject, projectDefaultBranch, fileChanges.length]);

  // Handle status bar clicks
  const handleChangesClick = () => {
    setActiveTab('git');
    onChangesClick?.();
  };

  // Render Editor tab content
  const editorContent = useMemo(() => {
    if (!taskPath) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <p className="text-sm">Select a task to view files</p>
        </div>
      );
    }
    return <EditorTab taskPath={taskPath} taskName={activeTask?.name} />;
  }, [taskPath, activeTask?.name]);

  // Render Git tab content
  const gitContent = useMemo(() => {
    return <GitTab taskId={taskId} taskPath={taskPath} />;
  }, [taskId, taskPath]);

  // Render Preview tab content
  const previewContent = useMemo(() => {
    return <PreviewTab taskId={taskId} />;
  }, [taskId]);

  // Determine if left sidebar should be visible
  const shouldShowLeftSidebar = showLeftSidebar && !showEditorMode;

  return (
    <div
      className="flex h-[100dvh] w-full flex-col bg-background text-foreground"
      style={
        {
          '--tb': TITLEBAR_HEIGHT,
          '--sb': STATUS_BAR_HEIGHT,
        } as React.CSSProperties
      }
    >
      {/* Titlebar */}
      {showTitlebar && titlebar}

      {/* Main content area */}
      <div
        className={`flex flex-1 overflow-hidden ${showTitlebar ? 'pt-[var(--tb)]' : ''}`}
      >
        {/* Left Sidebar - Fixed width */}
        {shouldShowLeftSidebar && (
          <div className="w-[280px] flex-shrink-0 overflow-hidden border-r">
            {leftSidebar}
          </div>
        )}

        {/* Main Panel with Tabs */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Tab Bar */}
          <TabBar />

          {/* Tab Content */}
          <TabContainer
            agentsContent={agentsContent}
            editorContent={editorContent}
            gitContent={gitContent}
            previewContent={previewContent}
            className="min-h-0 flex-1"
          />

          {/* Bottom Terminal Panel */}
          <TerminalPanel
            taskPath={taskPath}
            taskId={taskId}
            projectPath={selectedProject?.path}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        agentStatus={statusBarData.agentStatus}
        agentName={statusBarData.agentName}
        baseBranch={statusBarData.baseBranch}
        currentBranch={statusBarData.currentBranch}
        commitsBehind={statusBarData.commitsBehind}
        commitsAhead={statusBarData.commitsAhead}
        changesCount={statusBarData.changesCount}
        worktreeId={statusBarData.worktreeId}
        worktreePath={statusBarData.worktreePath}
        onAgentClick={onAgentClick}
        onBranchClick={onBranchClick}
        onChangesClick={handleChangesClick}
      />
    </div>
  );
}

export default AppLayout;
