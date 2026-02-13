import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppKeyboardShortcuts from './components/AppKeyboardShortcuts';
import { CloneFromUrlModal } from './components/CloneFromUrlModal';
import { AddRemoteProjectModal } from './components/ssh/AddRemoteProjectModal';
import CommandPaletteWrapper from './components/CommandPaletteWrapper';
import ErrorBoundary from './components/ErrorBoundary';
import { WelcomeScreen } from './components/WelcomeScreen';
import { GithubDeviceFlowModal } from './components/GithubDeviceFlowModal';
import LeftSidebar from './components/LeftSidebar';
import MainContentArea from './components/MainContentArea';
import { NewProjectModal } from './components/NewProjectModal';
import CodeEditor from './components/FileExplorer/CodeEditor';
import SettingsModal from './components/SettingsModal';
import TaskModal from './components/TaskModal';
import { ThemeProvider } from './components/ThemeProvider';
import Titlebar from './components/titlebar/Titlebar';
import { SidebarProvider } from './components/ui/sidebar';
import { RightSidebarProvider } from './components/ui/right-sidebar';
import { KeyboardSettingsProvider } from './contexts/KeyboardSettingsContext';
import { ToastAction } from './components/ui/toast';
import { Toaster } from './components/ui/toaster';
import { useToast } from './hooks/use-toast';
import { useAutoPrRefresh } from './hooks/useAutoPrRefresh';
import { useTheme } from './hooks/useTheme';
import useUpdateNotifier from './hooks/useUpdateNotifier';
import { AppLayout } from './layouts/AppLayout';
import type { LinearIssueSummary } from './types/linear';
import type { GitHubIssueSummary } from './types/github';
import type { JiraIssueSummary } from './types/jira';
import type { AgentRun } from './types/chat';
import type { Project } from './types/app';

// Extracted hooks
import { useModalState } from './hooks/useModalState';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useGithubIntegration } from './hooks/useGithubIntegration';
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

  // Ref for selectedProject, so useModalState can read it without re-instantiation
  const selectedProjectRef = useRef<{ id: string } | null>(null);

  // --- Modal / UI visibility state ---
  const modals = useModalState({ selectedProjectRef });

  const {
    showSettings,
    settingsInitialTab,
    showCommandPalette,
    showWelcomeScreen,
    showTaskModal,
    showNewProjectModal,
    showCloneModal,
    showEditorMode,
    showKanban,
    showDeviceFlowModal,
    setShowEditorMode,
    setShowKanban,
    setShowTaskModal,
    setShowNewProjectModal,
    setShowCloneModal,
    openSettings,
    handleToggleSettings,
    handleOpenSettings,
    handleOpenKeyboardShortcuts,
    handleCloseSettings,
    handleToggleCommandPalette,
    handleCloseCommandPalette,
    handleToggleKanban,
    handleToggleEditor,
    handleWelcomeGetStarted,
  } = modals;
  const [showRemoteProjectModal, setShowRemoteProjectModal] = useState<boolean>(false);

  // --- App initialization (version, platform, loadAppData) ---
  // The callbacks here execute inside a useEffect (after render), so all hooks
  // are already initialized by the time they run — no temporal dead zone issue.
  const appInit = useAppInitialization({
    checkGithubStatus: () => github.checkStatus(),
    onProjectsLoaded: (projects) => projectMgmt.setProjects(projects),
    onProjectSelected: (project) => projectMgmt.setSelectedProject(project),
    onShowHomeView: (show) => projectMgmt.setShowHomeView(show),
    onTaskSelected: (task) => taskMgmt.setActiveTask(task),
    onTaskAgentSelected: (agent) => taskMgmt.setActiveTaskAgent(agent),
    onInitialLoadComplete: () => {},
  });

  // --- GitHub integration ---
  const github = useGithubIntegration({
    platform: appInit.platform,
    toast,
    setShowDeviceFlowModal: modals.setShowDeviceFlowModal,
  });

  // --- Project management ---
  const projectMgmt = useProjectManagement({
    platform: appInit.platform,
    isAuthenticated: github.isAuthenticated,
    ghInstalled: github.ghInstalled,
    toast,
    handleGithubConnect: github.handleGithubConnect,
    setShowEditorMode,
    setShowKanban,
    setShowNewProjectModal,
    setShowCloneModal,
    setShowTaskModal,
    setActiveTask: (task) => taskMgmt.setActiveTask(task),
    saveProjectOrder: appInit.saveProjectOrder,
    ToastAction,
    storedActiveIds: appInit.storedActiveIds,
  });

  // Keep the selectedProject ref in sync for useModalState's kanban toggle guard
  // Using useEffect to avoid writing to ref during render (react-hooks/refs lint rule)
  useEffect(() => {
    selectedProjectRef.current = projectMgmt.selectedProject;
  }, [projectMgmt.selectedProject]);

  // --- Task management ---
  const taskMgmt = useTaskManagement({
    projects: projectMgmt.projects,
    selectedProject: projectMgmt.selectedProject,
    setProjects: projectMgmt.setProjects,
    setSelectedProject: projectMgmt.setSelectedProject,
    setShowHomeView: projectMgmt.setShowHomeView,
    setShowEditorMode,
    setShowKanban,
    setShowTaskModal,
    toast,
    activateProjectView: projectMgmt.activateProjectView,
  });

  // Sidebar context change handler for LeftSidebar
  const handleSidebarContextChange = useCallback(
    (_state: { open: boolean; isMobile: boolean; setOpen: (next: boolean) => void }) => {
      // Can be extended if needed
    },
    []
  );

  // Show toast on update availability
  useUpdateNotifier({ checkOnMount: true, onOpenSettings: () => openSettings('general') });

  // Auto-refresh PR status
  useAutoPrRefresh(taskMgmt.activeTask?.path);

  // --- Pinned tasks (localStorage) ---
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
      if (next.has(task.id)) {
        next.delete(task.id);
      } else {
        next.add(task.id);
      }
      localStorage.setItem(PINNED_TASKS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleDeleteTaskAndUnpin: typeof taskMgmt.handleDeleteTask = useCallback(
    async (project, task, options) => {
      setPinnedTaskIds((prev) => {
        if (!prev.has(task.id)) return prev;
        const next = new Set(prev);
        next.delete(task.id);
        localStorage.setItem(PINNED_TASKS_KEY, JSON.stringify([...next]));
        return next;
      });
      return taskMgmt.handleDeleteTask(project, task, options);
    },
    [taskMgmt.handleDeleteTask]
  );

  // --- Task creation wrapper ---
  const handleCreateTask = useCallback(
    async (
      taskName: string,
      initialPrompt?: string,
      agentRuns: AgentRun[] = [{ agent: 'claude', runs: 1 }],
      linkedLinearIssue: LinearIssueSummary | null = null,
      linkedGithubIssue: GitHubIssueSummary | null = null,
      linkedJiraIssue: JiraIssueSummary | null = null,
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
          linkedLinearIssue,
          linkedGithubIssue,
          linkedJiraIssue,
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
          gitInfo: {
            isGitRepo: true,
          },
          tasks: [],
          // Mark as remote project
          isRemote: true,
          sshConnectionId: remoteProject.connectionId,
          remotePath: remoteProject.path,
        } as Project;

        const saveResult = await window.electronAPI.saveProject(project);
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

  // --- Convenience aliases ---
  const { selectedProject } = projectMgmt;
  const { activeTask, activeTaskAgent } = taskMgmt;

  // Titlebar component for AppLayout
  const titlebar = useMemo(
    () => (
      <Titlebar
        onToggleSettings={handleToggleSettings}
        isSettingsOpen={showSettings}
        currentPath={
          activeTask?.metadata?.multiAgent?.enabled
            ? null
            : activeTask?.path ||
              (selectedProject?.isRemote
                ? selectedProject?.remotePath
                : selectedProject?.path) ||
              null
        }
        defaultPreviewUrl={null}
        taskId={activeTask?.id || null}
        taskPath={activeTask?.path || null}
        projectPath={selectedProject?.path || null}
        isTaskMultiAgent={Boolean(activeTask?.metadata?.multiAgent?.enabled)}
        githubUser={github.user}
        onToggleKanban={handleToggleKanban}
        isKanbanOpen={Boolean(showKanban)}
        kanbanAvailable={Boolean(selectedProject)}
        onToggleEditor={handleToggleEditor}
        showEditorButton={Boolean(activeTask)}
        isEditorOpen={showEditorMode}
        projects={projectMgmt.projects}
        selectedProject={selectedProject}
        activeTask={activeTask}
        onSelectProject={projectMgmt.handleSelectProject}
        onSelectTask={taskMgmt.handleSelectTask}
      />
    ),
    [
      handleToggleSettings,
      showSettings,
      activeTask,
      selectedProject,
      github.user,
      handleToggleKanban,
      showKanban,
      handleToggleEditor,
      showEditorMode,
      projectMgmt.projects,
      projectMgmt.handleSelectProject,
      taskMgmt.handleSelectTask,
    ]
  );

  // Left sidebar content for AppLayout
  const leftSidebar = useMemo(
    () => (
      <LeftSidebar
        projects={projectMgmt.projects}
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
        onArchiveTask={taskMgmt.handleArchiveTask}
        onRestoreTask={taskMgmt.handleRestoreTask}
        onDeleteProject={projectMgmt.handleDeleteProject}
        pinnedTaskIds={pinnedTaskIds}
        onPinTask={handlePinTask}
      />
    ),
    [
      projectMgmt.projects,
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
      taskMgmt.handleArchiveTask,
      taskMgmt.handleRestoreTask,
      projectMgmt.handleDeleteProject,
      pinnedTaskIds,
      handlePinTask,
    ]
  );

  // Agents tab content (MainContentArea)
  const agentsContent = useMemo(
    () => (
      <MainContentArea
        selectedProject={selectedProject}
        activeTask={activeTask}
        activeTaskAgent={activeTaskAgent}
        showKanban={showKanban}
        showHomeView={projectMgmt.showHomeView}
        showSkillsView={projectMgmt.showSkillsView}
        projectDefaultBranch={projectMgmt.projectDefaultBranch}
        projectBranchOptions={projectMgmt.projectBranchOptions}
        isLoadingBranches={projectMgmt.isLoadingBranches}
        setProjectDefaultBranch={projectMgmt.setProjectDefaultBranch}
        handleSelectTask={taskMgmt.handleSelectTask}
        handleDeleteTask={taskMgmt.handleDeleteTask}
        handleArchiveTask={taskMgmt.handleArchiveTask}
        handleDeleteProject={projectMgmt.handleDeleteProject}
        handleOpenProject={projectMgmt.handleOpenProject}
        handleNewProjectClick={projectMgmt.handleNewProjectClick}
        handleCloneProjectClick={projectMgmt.handleCloneProjectClick}
        handleAddRemoteProject={handleAddRemoteProjectClick}
        setShowTaskModal={(show: boolean) => setShowTaskModal(show)}
        setShowKanban={(show: boolean) => setShowKanban(show)}
      />
    ),
    [
      selectedProject,
      activeTask,
      activeTaskAgent,
      showKanban,
      projectMgmt.showHomeView,
      projectMgmt.showSkillsView,
      projectMgmt.projectDefaultBranch,
      projectMgmt.projectBranchOptions,
      projectMgmt.isLoadingBranches,
      projectMgmt.setProjectDefaultBranch,
      taskMgmt.handleSelectTask,
      taskMgmt.handleDeleteTask,
      taskMgmt.handleArchiveTask,
      projectMgmt.handleDeleteProject,
      projectMgmt.handleOpenProject,
      projectMgmt.handleNewProjectClick,
      projectMgmt.handleCloneProjectClick,
      handleAddRemoteProjectClick,
      setShowTaskModal,
      setShowKanban,
    ]
  );

  return (
    <KeyboardSettingsProvider>
      <SidebarProvider>
        <RightSidebarProvider>
          <AppKeyboardShortcuts
            showCommandPalette={showCommandPalette}
            showSettings={showSettings}
            handleToggleCommandPalette={handleToggleCommandPalette}
            handleOpenSettings={handleOpenSettings}
            handleCloseCommandPalette={handleCloseCommandPalette}
            handleCloseSettings={handleCloseSettings}
            handleToggleKanban={handleToggleKanban}
            handleToggleEditor={handleToggleEditor}
            handleNextTask={taskMgmt.handleNextTask}
            handlePrevTask={taskMgmt.handlePrevTask}
            handleNewTask={taskMgmt.handleNewTask}
          />

          {showWelcomeScreen ? (
            <WelcomeScreen onGetStarted={handleWelcomeGetStarted} />
          ) : (
            <AppLayout
              leftSidebar={leftSidebar}
              agentsContent={agentsContent}
              selectedProject={selectedProject}
              activeTask={activeTask}
              activeTaskAgent={activeTaskAgent}
              projectDefaultBranch={projectMgmt.projectDefaultBranch}
              showLeftSidebar={!showEditorMode}
              showEditorMode={showEditorMode}
              titlebar={titlebar}
              showTitlebar={true}
            />
          )}

          {/* Modals - rendered at App level */}
          <SettingsModal
            isOpen={showSettings}
            onClose={handleCloseSettings}
            initialTab={settingsInitialTab}
          />
          <CommandPaletteWrapper
            isOpen={showCommandPalette}
            onClose={handleCloseCommandPalette}
            projects={projectMgmt.projects}
            handleSelectProject={projectMgmt.handleSelectProject}
            handleSelectTask={taskMgmt.handleSelectTask}
            handleGoHome={projectMgmt.handleGoHome}
            handleOpenProject={projectMgmt.handleOpenProject}
            handleOpenSettings={handleOpenSettings}
            handleOpenKeyboardShortcuts={handleOpenKeyboardShortcuts}
          />
          {showEditorMode && activeTask && selectedProject && (
            <CodeEditor
              taskPath={activeTask.path}
              taskName={activeTask.name}
              projectName={selectedProject.name}
              onClose={() => setShowEditorMode(false)}
            />
          )}
          <TaskModal
            isOpen={showTaskModal}
            onClose={() => setShowTaskModal(false)}
            onCreateTask={handleCreateTask}
            projectName={selectedProject?.name || ''}
            defaultBranch={projectMgmt.projectDefaultBranch}
            existingNames={(selectedProject?.tasks || []).map((w) => w.name)}
            linkedGithubIssueMap={taskMgmt.linkedGithubIssueMap}
            projectPath={selectedProject?.path}
            branchOptions={projectMgmt.projectBranchOptions}
            isLoadingBranches={projectMgmt.isLoadingBranches}
            subRepos={selectedProject?.subRepos}
          />
          <NewProjectModal
            isOpen={showNewProjectModal}
            onClose={() => setShowNewProjectModal(false)}
            onSuccess={projectMgmt.handleNewProjectSuccess}
          />
          <CloneFromUrlModal
            isOpen={showCloneModal}
            onClose={() => setShowCloneModal(false)}
            onSuccess={projectMgmt.handleCloneSuccess}
          />
          <AddRemoteProjectModal
            isOpen={showRemoteProjectModal}
            onClose={() => setShowRemoteProjectModal(false)}
            onSuccess={handleRemoteProjectSuccess}
          />
          <GithubDeviceFlowModal
            open={showDeviceFlowModal}
            onClose={github.handleDeviceFlowClose}
            onSuccess={github.handleDeviceFlowSuccess}
            onError={github.handleDeviceFlowError}
          />
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
