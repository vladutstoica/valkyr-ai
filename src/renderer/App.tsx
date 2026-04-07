import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import AppKeyboardShortcuts from './components/commands/AppKeyboardShortcuts';
import ErrorBoundary from './components/ErrorBoundary';
import { WelcomeScreen } from './components/WelcomeScreen';
import LeftSidebar from './components/LeftSidebar';
import MainContentArea from './components/MainContentArea';
import { unifiedStatusStore } from './lib/unifiedStatusStore';
import { useMultiViewStore } from './hooks/useMultiViewStore';
import { useAppMode } from './hooks/useAppMode';
import { ThemeProvider } from './components/ThemeProvider';

// Lazy-loaded modals — only fetched when opened
const TaskModal = React.lazy(() => import('./components/project/TaskModal'));
const CommandPaletteWrapper = React.lazy(
  () => import('./components/commands/CommandPaletteWrapper')
);
const NewProjectModal = React.lazy(() =>
  import('./components/project/NewProjectModal').then((m) => ({ default: m.NewProjectModal }))
);
const CloneFromUrlModal = React.lazy(() =>
  import('./components/project/CloneFromUrlModal').then((m) => ({ default: m.CloneFromUrlModal }))
);
const AddRemoteProjectModal = React.lazy(() =>
  import('./components/ssh/AddRemoteProjectModal').then((m) => ({
    default: m.AddRemoteProjectModal,
  }))
);
const KeyboardShortcutsDialog = React.lazy(() =>
  import('./components/commands/KeyboardShortcutsDialog').then((m) => ({
    default: m.KeyboardShortcutsDialog,
  }))
);
const PrerequisiteModal = React.lazy(() =>
  import('./components/PrerequisiteModal').then((m) => ({ default: m.PrerequisiteModal }))
);
import Titlebar from './components/titlebar/Titlebar';
import { SidebarProvider } from './components/ui/sidebar';
import { RightSidebarProvider } from './components/ui/right-sidebar';
import { KeyboardSettingsProvider } from './contexts/KeyboardSettingsContext';
import { Toaster } from './components/ui/toaster';
import { useToast } from './hooks/use-toast';
import { useAutoPrRefresh } from './hooks/useAutoPrRefresh';
import { useTheme } from './hooks/useTheme';
import useUpdateNotifier from './hooks/useUpdateNotifier';
import { AppLayout } from './layouts/AppLayout';
import type { AgentRun } from './types/chat';
import type { Project } from './types/app';

// Extracted hooks
import { useModalState } from './hooks/useModalState';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useProjectManagement } from './hooks/useProjectManagement';
import { useTaskManagement } from './hooks/useTaskManagement';
import { createTask } from './lib/taskCreationService';

// No layout constants needed - AppLayout handles them internally

const PINNED_TASKS_KEY = 'valkyr-pinned-tasks';

const AppContent: React.FC = () => {
  useTheme(); // Initialize theme on app startup
  const { toast } = useToast();

  // Synchronize all spinner animations by setting a global timestamp offset
  useEffect(() => {
    document.documentElement.style.setProperty('--spinner-sync-time', String(Date.now() % 1000000));
  }, []);

  // --- Modal / UI visibility state ---
  const modals = useModalState();

  const {
    showCommandPalette,
    showWelcomeScreen,
    showTaskModal,
    showNewProjectModal,
    showCloneModal,
    setShowTaskModal,
    setShowNewProjectModal,
    setShowCloneModal,
    handleOpenKeyboardShortcuts,
    handleToggleCommandPalette,
    handleCloseCommandPalette,
    handleWelcomeGetStarted,
  } = modals;
  const [showRemoteProjectModal, setShowRemoteProjectModal] = useState<boolean>(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [prerequisiteModal, setPrerequisiteModal] = useState<{
    open: boolean;
    gitMissing: boolean;
    agents: string[];
  }>({ open: false, gitMissing: false, agents: [] });

  // Run prerequisite check after welcome screen is dismissed
  const originalWelcomeGetStarted = handleWelcomeGetStarted;
  const handleWelcomeWithPrereqCheck = useCallback(() => {
    originalWelcomeGetStarted();
    window.electronAPI.checkPrerequisites().then((result) => {
      if (result.success) {
        const { git, agents } = result.data;
        if (!git || agents.length === 0) {
          setPrerequisiteModal({ open: true, gitMissing: !git, agents });
        }
      }
    });
  }, [originalWelcomeGetStarted, toast]);

  // --- App initialization (version, platform, loadAppData) ---
  // The callbacks here execute inside a useEffect (after render), so all hooks
  // are already initialized by the time they run — no temporal dead zone issue.
  const appInit = useAppInitialization({
    checkGithubStatus: () => Promise.resolve(),
    onProjectsLoaded: (projects) => projectMgmt.setProjects(projects),
    onGroupsLoaded: (groups) => projectMgmt.setGroups(groups),
    onWorkspacesLoaded: (workspaces) => projectMgmt.setWorkspaces(workspaces),
    onProjectSelected: (project) => projectMgmt.setSelectedProject(project),
    onShowHomeView: (show) => projectMgmt.setShowHomeView(show),
    onTaskSelected: (task) => taskMgmt.setActiveTask(task),
    onTaskAgentSelected: (agent) => taskMgmt.setActiveTaskAgent(agent),
    onInitialLoadComplete: () => {},
  });

  // --- Project management ---
  const projectMgmt = useProjectManagement({
    platform: appInit.platform,
    toast,
    setShowNewProjectModal,
    setShowCloneModal,
    setShowTaskModal,
    setActiveTask: (task) => taskMgmt.setActiveTask(task),
    saveProjectOrder: appInit.saveProjectOrder,
    storedActiveIds: appInit.storedActiveIds,
  });

  // --- Task management ---
  const taskMgmt = useTaskManagement({
    projects: projectMgmt.projects,
    selectedProject: projectMgmt.selectedProject,
    setProjects: projectMgmt.setProjects,
    setSelectedProject: projectMgmt.setSelectedProject,
    setShowHomeView: projectMgmt.setShowHomeView,
    setShowTaskModal,
    toast,
    activateProjectView: projectMgmt.activateProjectView,
  });

  // Deep-navigation from notification clicks: listen for navigate events
  // and select the corresponding task
  useEffect(() => {
    const unsub = unifiedStatusStore.onNavigate((taskId) => {
      // Find the task across all projects
      for (const project of projectMgmt.projects) {
        const task = project.tasks?.find((t: { id: string }) => t.id === taskId);
        if (task) {
          projectMgmt.activateProjectView(project);
          taskMgmt.handleSelectTask(task);
          break;
        }
      }
    });
    return unsub;
  }, [projectMgmt.projects, projectMgmt.activateProjectView, taskMgmt.handleSelectTask]);

  // Sidebar context change handler for LeftSidebar
  const handleSidebarContextChange = useCallback(
    (_state: { open: boolean; isMobile: boolean; setOpen: (next: boolean) => void }) => {
      // Can be extended if needed
    },
    []
  );

  // Override settings navigation to use full-page view instead of modal
  const openSettingsView = useCallback(
    (tab?: import('./hooks/useModalState').SettingsTab) => {
      projectMgmt.handleGoToSettings(tab);
      modals.handleCloseSettings(); // close modal if open for backward compat
    },
    [projectMgmt.handleGoToSettings, modals.handleCloseSettings]
  );

  const handleToggleSettingsView = useCallback(() => {
    if (projectMgmt.showSettingsView) {
      projectMgmt.handleGoBackFromSettings();
    } else {
      openSettingsView('general');
    }
  }, [projectMgmt.showSettingsView, projectMgmt.handleGoBackFromSettings, openSettingsView]);

  const handleCloseSettingsView = useCallback(() => {
    if (projectMgmt.showSettingsView) {
      projectMgmt.handleGoBackFromSettings();
    }
  }, [projectMgmt.showSettingsView, projectMgmt.handleGoBackFromSettings]);

  // Show toast on update availability
  useUpdateNotifier({ checkOnMount: true, onOpenSettings: () => openSettingsView('about') });

  // Auto-refresh PR status
  useAutoPrRefresh(taskMgmt.activeTask?.path);

  // --- Pinned tasks (localStorage + DB) ---
  const [pinnedTaskIds, setPinnedTaskIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(PINNED_TASKS_KEY);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const handlePinTask = useCallback((task: { id: string }) => {
    setPinnedTaskIds((prev) => {
      const next = new Set(prev);
      const pinned = !next.has(task.id);
      if (pinned) {
        next.add(task.id);
      } else {
        next.delete(task.id);
      }
      localStorage.setItem(PINNED_TASKS_KEY, JSON.stringify([...next]));
      try {
        window.electronAPI?.setTaskPinned?.({ taskId: task.id, pinned });
      } catch {}
      return next;
    });
  }, []);

  // --- Muted project notifications ---
  const [mutedProjectIds, setMutedProjectIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('valkyr:mutedProjects');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleToggleProjectMute = useCallback((projectId: string) => {
    setMutedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      const arr = [...next];
      localStorage.setItem('valkyr:mutedProjects', JSON.stringify(arr));
      // Persist to settings so main process can check
      try {
        window.electronAPI?.updateSettings?.({
          notifications: { mutedProjects: arr },
        });
      } catch {}
      return next;
    });
  }, []);

  const removeMultiViewColumn = useMultiViewStore((s) => s.removeColumn);

  const handleDeleteTaskAndUnpin: typeof taskMgmt.handleDeleteTask = useCallback(
    async (project, task, options) => {
      removeMultiViewColumn(task.id);
      setPinnedTaskIds((prev) => {
        if (!prev.has(task.id)) return prev;
        const next = new Set(prev);
        next.delete(task.id);
        localStorage.setItem(PINNED_TASKS_KEY, JSON.stringify([...next]));
        return next;
      });
      return taskMgmt.handleDeleteTask(project, task, options);
    },
    [taskMgmt.handleDeleteTask, removeMultiViewColumn]
  );

  const handleArchiveTaskAndCleanup: typeof taskMgmt.handleArchiveTask = useCallback(
    async (project, task, options) => {
      removeMultiViewColumn(task.id);
      return taskMgmt.handleArchiveTask(project, task, options);
    },
    [taskMgmt.handleArchiveTask, removeMultiViewColumn]
  );

  // --- Task creation wrapper ---
  const handleCreateTask = useCallback(
    async (
      taskName: string,
      initialPrompt?: string,
      agentRuns: AgentRun[] = [{ agent: 'claude', runs: 1 }],
      autoApprove?: boolean,
      useWorktree: boolean = true,
      baseRef?: string,
      selectedSubRepos?: string[]
    ) => {
      if (!projectMgmt.selectedProject) return;
      await createTask(
        {
          taskName,
          initialPrompt,
          agentRuns,
          autoApprove,
          useWorktree,
          baseRef,
          selectedSubRepos,
        },
        {
          selectedProject: projectMgmt.selectedProject,
          setProjects: projectMgmt.setProjects,
          setSelectedProject: projectMgmt.setSelectedProject,
          setActiveTask: taskMgmt.setActiveTask,
          setActiveTaskAgent: taskMgmt.setActiveTaskAgent,
          toast,
        }
      );
    },
    [
      projectMgmt.selectedProject,
      projectMgmt.setProjects,
      projectMgmt.setSelectedProject,
      taskMgmt.setActiveTask,
      taskMgmt.setActiveTaskAgent,
      toast,
    ]
  );

  // --- SSH Remote Project handlers ---
  const handleAddRemoteProjectClick = useCallback(() => {
    setShowRemoteProjectModal(true);
  }, []);

  const handleRemoteProjectSuccess = useCallback(
    async (remoteProject: {
      id: string;
      name: string;
      path: string;
      host: string;
      connectionId: string;
    }) => {
      const { captureTelemetry } = await import('./lib/telemetryClient');
      captureTelemetry('remote_project_created');

      try {
        // Create project object for remote project
        const project: Project = {
          id: remoteProject.id,
          name: remoteProject.name,
          path: remoteProject.path,
          repoKey: `${remoteProject.host}:${remoteProject.path}`,
          workspaceId: projectMgmt.activeWorkspaceId,
          gitInfo: {
            isGitRepo: true,
          },
          tasks: [],
          // Mark as remote project
          isRemote: true,
          sshConnectionId: remoteProject.connectionId,
          remotePath: remoteProject.path,
        } as Project;

        const { saveProject } = await import('./services/projectService');
        const saveResult = await saveProject(project);
        if (saveResult.success) {
          captureTelemetry('project_create_success');
          captureTelemetry('project_added_success', { source: 'remote' });
          toast({
            title: 'Remote project added successfully!',
            description: `${project.name} on ${remoteProject.host} has been added to your projects.`,
          });
          // Add to beginning of list
          projectMgmt.setProjects((prev) => {
            const updated = [project, ...prev];
            appInit.saveProjectOrder(updated);
            return updated;
          });
          projectMgmt.activateProjectView(project);
        } else {
          toast({
            title: 'Failed to save remote project',
            description: saveResult.error || 'Unknown error occurred',
            variant: 'destructive',
          });
        }
      } catch (error) {
        const { log } = await import('./lib/logger');
        log.error('Failed to save remote project:', error);
        toast({
          title: 'Failed to add remote project',
          description: 'An error occurred while saving the project.',
          variant: 'destructive',
        });
      }
    },
    [projectMgmt.activateProjectView, toast, appInit.saveProjectOrder]
  );

  // --- Auto-add newly created tasks to multi-view ---
  const appMode = useAppMode((s) => s.mode);
  const addMultiViewColumn = useMultiViewStore((s) => s.addColumn);
  const prevActiveTaskIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const currentId = taskMgmt.activeTask?.id ?? null;
    const prevId = prevActiveTaskIdRef.current;
    prevActiveTaskIdRef.current = currentId;
    // If in multi mode and activeTask changed to a new task, auto-add it
    if (appMode === 'multi' && currentId && currentId !== prevId) {
      const projectId = taskMgmt.activeTask?.projectId;
      if (projectId) {
        addMultiViewColumn(currentId, projectId);
      }
    }
  }, [appMode, taskMgmt.activeTask?.id, taskMgmt.activeTask?.projectId, addMultiViewColumn]);

  // --- Convenience aliases ---
  const { selectedProject } = projectMgmt;
  const { activeTask, activeTaskAgent } = taskMgmt;

  // Refresh sub-repo branch data after a branch switch in the StatusBar
  const handleBranchChange = useCallback(() => {
    if (selectedProject) {
      projectMgmt.refreshProjectSubRepos(selectedProject);
    }
  }, [selectedProject, projectMgmt.refreshProjectSubRepos]);

  // Titlebar component for AppLayout
  const titlebar = useMemo(
    () => (
      <Titlebar
        onToggleSettings={handleToggleSettingsView}
        isSettingsOpen={projectMgmt.showSettingsView}
        currentPath={
          activeTask?.metadata?.multiAgent?.enabled
            ? null
            : activeTask?.path ||
              (selectedProject?.isRemote ? selectedProject?.remotePath : selectedProject?.path) ||
              null
        }
        projects={projectMgmt.projects}
        selectedProject={selectedProject}
        activeTask={activeTask}
        onSelectProject={projectMgmt.handleSelectProject}
        onSelectTask={taskMgmt.handleSelectTask}
      />
    ),
    [
      handleToggleSettingsView,
      projectMgmt.showSettingsView,
      activeTask,
      selectedProject,
      projectMgmt.projects,
      projectMgmt.handleSelectProject,
      taskMgmt.handleSelectTask,
    ]
  );

  // Left sidebar content for AppLayout
  const leftSidebar = useMemo(
    () => (
      <LeftSidebar
        projects={projectMgmt.filteredProjects}
        allProjects={projectMgmt.projects}
        archivedTasksVersion={taskMgmt.archivedTasksVersion}
        selectedProject={selectedProject}
        onSelectProject={projectMgmt.handleSelectProject}
        onOpenProject={projectMgmt.handleOpenProject}
        onNewProject={projectMgmt.handleNewProjectClick}
        onCloneProject={projectMgmt.handleCloneProjectClick}
        onAddRemoteProject={handleAddRemoteProjectClick}
        onSelectTask={taskMgmt.handleSelectTask}
        activeTask={activeTask || undefined}
        onReorderProjects={projectMgmt.handleReorderProjects}
        onReorderProjectsFull={projectMgmt.handleReorderProjectsFull}
        onSidebarContextChange={handleSidebarContextChange}
        onCreateTaskForProject={taskMgmt.handleStartCreateTaskFromSidebar}
        onDeleteTask={handleDeleteTaskAndUnpin}
        onRenameTask={taskMgmt.handleRenameTask}
        onArchiveTask={handleArchiveTaskAndCleanup}
        onRestoreTask={taskMgmt.handleRestoreTask}
        onDeleteProject={projectMgmt.handleDeleteProject}
        onRenameProject={projectMgmt.handleRenameProject}
        pinnedTaskIds={pinnedTaskIds}
        onPinTask={handlePinTask}
        groups={projectMgmt.groups}
        onCreateGroup={projectMgmt.handleCreateGroup}
        onRenameGroup={projectMgmt.handleRenameGroup}
        onDeleteGroup={projectMgmt.handleDeleteGroup}
        onReorderGroups={projectMgmt.handleReorderGroups}
        onMoveProjectToGroup={projectMgmt.handleMoveProjectToGroup}
        onToggleGroupCollapsed={projectMgmt.handleToggleGroupCollapsed}
        workspaces={projectMgmt.workspaces}
        activeWorkspaceId={projectMgmt.activeWorkspaceId}
        onSwitchWorkspace={projectMgmt.handleSwitchWorkspace}
        onCreateWorkspace={projectMgmt.handleCreateWorkspace}
        onRenameWorkspace={projectMgmt.handleRenameWorkspace}
        onDeleteWorkspace={projectMgmt.handleDeleteWorkspace}
        onUpdateWorkspaceColor={projectMgmt.handleUpdateWorkspaceColor}
        onReorderWorkspaces={projectMgmt.handleReorderWorkspaces}
        onMoveProjectToWorkspace={projectMgmt.handleMoveProjectToWorkspace}
        onOpenSettings={() => openSettingsView('general')}
        mutedProjectIds={mutedProjectIds}
        onToggleProjectMute={handleToggleProjectMute}
      />
    ),
    [
      projectMgmt.filteredProjects,
      taskMgmt.archivedTasksVersion,
      selectedProject,
      projectMgmt.handleSelectProject,
      projectMgmt.handleOpenProject,
      projectMgmt.handleNewProjectClick,
      projectMgmt.handleCloneProjectClick,
      handleAddRemoteProjectClick,
      taskMgmt.handleSelectTask,
      activeTask,
      projectMgmt.handleReorderProjects,
      projectMgmt.handleReorderProjectsFull,
      handleSidebarContextChange,
      taskMgmt.handleStartCreateTaskFromSidebar,
      handleDeleteTaskAndUnpin,
      taskMgmt.handleRenameTask,
      handleArchiveTaskAndCleanup,
      taskMgmt.handleRestoreTask,
      projectMgmt.handleDeleteProject,
      projectMgmt.handleRenameProject,
      pinnedTaskIds,
      handlePinTask,
      projectMgmt.groups,
      projectMgmt.handleCreateGroup,
      projectMgmt.handleRenameGroup,
      projectMgmt.handleDeleteGroup,
      projectMgmt.handleReorderGroups,
      projectMgmt.handleMoveProjectToGroup,
      projectMgmt.handleToggleGroupCollapsed,
      projectMgmt.workspaces,
      projectMgmt.activeWorkspaceId,
      projectMgmt.handleSwitchWorkspace,
      projectMgmt.handleCreateWorkspace,
      projectMgmt.handleRenameWorkspace,
      projectMgmt.handleDeleteWorkspace,
      projectMgmt.handleUpdateWorkspaceColor,
      projectMgmt.handleReorderWorkspaces,
      projectMgmt.handleMoveProjectToWorkspace,
      openSettingsView,
      mutedProjectIds,
      handleToggleProjectMute,
    ]
  );

  // Agents tab content (MainContentArea)
  const agentsContent = useMemo(
    () => (
      <MainContentArea
        allProjects={projectMgmt.projects}
        selectedProject={selectedProject}
        activeTask={activeTask}
        activeTaskAgent={activeTaskAgent}
        showHomeView={projectMgmt.showHomeView}
        showSkillsView={projectMgmt.showSkillsView}
        showSettingsView={projectMgmt.showSettingsView}
        settingsViewTab={projectMgmt.settingsViewTab}
        settingsProjectPath={selectedProject?.path}
        handleGoBackFromSettings={projectMgmt.handleGoBackFromSettings}
        projectDefaultBranch={projectMgmt.projectDefaultBranch}
        projectBranchOptions={projectMgmt.projectBranchOptions}
        isLoadingBranches={projectMgmt.isLoadingBranches}
        setProjectDefaultBranch={projectMgmt.setProjectDefaultBranch}
        handleSelectTask={taskMgmt.handleSelectTask}
        handleDeleteTask={handleDeleteTaskAndUnpin}
        handleArchiveTask={handleArchiveTaskAndCleanup}
        handleRenameTask={taskMgmt.handleRenameTask}
        handleDeleteProject={projectMgmt.handleDeleteProject}
        handleOpenProject={projectMgmt.handleOpenProject}
        handleNewProjectClick={projectMgmt.handleNewProjectClick}
        handleCloneProjectClick={projectMgmt.handleCloneProjectClick}
        handleAddRemoteProject={handleAddRemoteProjectClick}
        setShowTaskModal={(show: boolean) => setShowTaskModal(show)}
        setSelectedProject={projectMgmt.setSelectedProject}
      />
    ),
    [
      projectMgmt.projects,
      selectedProject,
      activeTask,
      activeTaskAgent,
      projectMgmt.showHomeView,
      projectMgmt.showSkillsView,
      projectMgmt.showSettingsView,
      projectMgmt.settingsViewTab,
      projectMgmt.handleGoBackFromSettings,
      projectMgmt.projectDefaultBranch,
      projectMgmt.projectBranchOptions,
      projectMgmt.isLoadingBranches,
      projectMgmt.setProjectDefaultBranch,
      taskMgmt.handleSelectTask,
      handleDeleteTaskAndUnpin,
      handleArchiveTaskAndCleanup,
      taskMgmt.handleRenameTask,
      projectMgmt.handleDeleteProject,
      projectMgmt.handleOpenProject,
      projectMgmt.handleNewProjectClick,
      projectMgmt.handleCloneProjectClick,
      handleAddRemoteProjectClick,
      setShowTaskModal,
    ]
  );

  return (
    <KeyboardSettingsProvider>
      <SidebarProvider>
        <RightSidebarProvider>
          <AppKeyboardShortcuts
            showCommandPalette={showCommandPalette}
            showSettings={projectMgmt.showSettingsView}
            handleToggleCommandPalette={handleToggleCommandPalette}
            handleOpenSettings={openSettingsView}
            handleCloseCommandPalette={handleCloseCommandPalette}
            handleCloseSettings={handleCloseSettingsView}
            handleNextTask={taskMgmt.handleNextTask}
            handlePrevTask={taskMgmt.handlePrevTask}
            handleNewTask={taskMgmt.handleNewTask}
          />

          {showWelcomeScreen ? (
            <WelcomeScreen onGetStarted={handleWelcomeWithPrereqCheck} />
          ) : (
            <AppLayout
              leftSidebar={leftSidebar}
              agentsContent={agentsContent}
              selectedProject={selectedProject}
              activeTask={activeTask}
              activeTaskAgent={activeTaskAgent}
              projectDefaultBranch={projectMgmt.projectDefaultBranch}
              titlebar={titlebar}
              showTitlebar={true}
              onBranchChange={handleBranchChange}
            />
          )}

          {/* Modals - lazy-loaded, only mounted when open */}
          <Suspense fallback={null}>
            {showCommandPalette && (
              <CommandPaletteWrapper
                isOpen={showCommandPalette}
                onClose={handleCloseCommandPalette}
                projects={projectMgmt.projects}
                handleSelectProject={projectMgmt.handleSelectProject}
                handleSelectTask={taskMgmt.handleSelectTask}
                handleGoHome={projectMgmt.handleGoHome}
                handleOpenProject={projectMgmt.handleOpenProject}
                handleOpenSettings={openSettingsView}
                handleOpenKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
              />
            )}
            {showTaskModal && (
              <TaskModal
                isOpen={showTaskModal}
                onClose={() => setShowTaskModal(false)}
                onCreateTask={handleCreateTask}
                projectName={selectedProject?.name || ''}
                defaultBranch={projectMgmt.projectDefaultBranch}
                existingNames={(selectedProject?.tasks || []).map((w) => w.name)}
                projectPath={selectedProject?.path}
                branchOptions={projectMgmt.projectBranchOptions}
                isLoadingBranches={projectMgmt.isLoadingBranches}
                subRepos={selectedProject?.subRepos}
                hasExistingNonWorktreeTask={(selectedProject?.tasks || []).some(
                  (t) => t.useWorktree === false
                )}
              />
            )}
            {showNewProjectModal && (
              <NewProjectModal
                isOpen={showNewProjectModal}
                onClose={() => setShowNewProjectModal(false)}
                onSuccess={projectMgmt.handleNewProjectSuccess}
              />
            )}
            {showCloneModal && (
              <CloneFromUrlModal
                isOpen={showCloneModal}
                onClose={() => setShowCloneModal(false)}
                onSuccess={projectMgmt.handleCloneSuccess}
              />
            )}
            {showRemoteProjectModal && (
              <AddRemoteProjectModal
                isOpen={showRemoteProjectModal}
                onClose={() => setShowRemoteProjectModal(false)}
                onSuccess={handleRemoteProjectSuccess}
              />
            )}
            {showKeyboardShortcuts && (
              <KeyboardShortcutsDialog
                isOpen={showKeyboardShortcuts}
                onClose={() => setShowKeyboardShortcuts(false)}
              />
            )}
            {prerequisiteModal.open && (
              <PrerequisiteModal
                isOpen={prerequisiteModal.open}
                onClose={() => setPrerequisiteModal((prev) => ({ ...prev, open: false }))}
                gitMissing={prerequisiteModal.gitMissing}
                detectedAgents={prerequisiteModal.agents}
              />
            )}
          </Suspense>
          <Toaster />
        </RightSidebarProvider>
      </SidebarProvider>
    </KeyboardSettingsProvider>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
