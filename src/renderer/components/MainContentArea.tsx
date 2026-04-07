import React from 'react';
import ChatInterface from './chat/ChatInterface';
import MultiAgentTask from './project/MultiAgentTask';
import ProjectMainView from './ProjectMainView';
import HomeView from './HomeView';
import SkillsView from './skills/SkillsView';
import SettingsView from './settings/SettingsView';
import { MultiViewLayout } from './multi-view';
import { useAppMode } from '../hooks/useAppMode';
import type { Agent } from '../types';
import type { Project, Task } from '../types/app';
import type { SettingsTab } from '../hooks/useModalState';

interface MainContentAreaProps {
  allProjects: Project[];
  selectedProject: Project | null;
  activeTask: Task | null;
  activeTaskAgent: Agent | null;
  showHomeView: boolean;
  showSkillsView: boolean;
  showSettingsView: boolean;
  settingsViewTab: SettingsTab;
  settingsProjectPath?: string;
  handleGoBackFromSettings: () => void;
  projectDefaultBranch: string;
  projectBranchOptions: Array<{ value: string; label: string }>;
  isLoadingBranches: boolean;
  setProjectDefaultBranch: (branch: string) => void;
  handleSelectTask: (task: Task) => void;
  handleDeleteTask: (
    project: Project,
    task: Task,
    options?: { silent?: boolean }
  ) => Promise<boolean>;
  handleArchiveTask: (
    project: Project,
    task: Task,
    options?: { silent?: boolean }
  ) => Promise<boolean>;
  handleRenameTask?: (project: Project, task: Task, newName: string) => Promise<void>;
  handleDeleteProject: (project: Project) => Promise<void>;
  handleOpenProject: () => void;
  handleNewProjectClick: () => void;
  handleCloneProjectClick: () => void;
  handleAddRemoteProject: () => void;
  setShowTaskModal: (show: boolean) => void;
  setSelectedProject: (project: Project) => void;
}

const MainContentArea: React.FC<MainContentAreaProps> = ({
  allProjects,
  selectedProject,
  activeTask,
  activeTaskAgent,
  showHomeView,
  showSkillsView,
  showSettingsView,
  settingsViewTab,
  settingsProjectPath,
  handleGoBackFromSettings,
  projectDefaultBranch,
  projectBranchOptions,
  isLoadingBranches,
  setProjectDefaultBranch,
  handleSelectTask,
  handleDeleteTask,
  handleArchiveTask,
  handleRenameTask,
  handleDeleteProject,
  handleOpenProject,
  handleNewProjectClick,
  handleCloneProjectClick,
  handleAddRemoteProject,
  setShowTaskModal,
  setSelectedProject,
}) => {
  const appMode = useAppMode((s) => s.mode);
  const isMultiMode = appMode === 'multi';

  // Determine which overlay view is active (if any).
  // Task components are ALWAYS kept mounted underneath to preserve
  // ACP transports, PTY sessions, useChat state, and IPC listeners.
  // In multi mode, only Settings acts as an overlay — Home and Skills are suppressed.
  const showOverlay = isMultiMode
    ? showSettingsView
    : showSettingsView || showSkillsView || showHomeView;
  const showProjectView = !!selectedProject && !showOverlay;

  return (
    <>
      {/* Overlay views — rendered on top, task components stay alive underneath */}
      {showSettingsView && (
        <SettingsView
          initialTab={settingsViewTab}
          onBack={handleGoBackFromSettings}
          projectPath={settingsProjectPath}
        />
      )}
      {!isMultiMode && showSkillsView && <SkillsView />}
      {!isMultiMode && showHomeView && !showSettingsView && !showSkillsView && <HomeView />}

      {/* Multi-view mode — shows multiple sessions side by side */}
      {isMultiMode && !showOverlay && (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <MultiViewLayout
            allProjects={allProjects}
            setShowTaskModal={setShowTaskModal}
            setSelectedProject={setSelectedProject}
            onArchiveTask={(project, task) => handleArchiveTask(project, task)}
            onDeleteTask={(project, task) => handleDeleteTask(project, task)}
            onRenameTask={handleRenameTask ? (project, task, newName) => handleRenameTask(project, task, newName) : undefined}
          />
        </div>
      )}

      {/* Task components — always mounted, hidden when an overlay or different task is active.
          This keeps ACP transports, useChat state, PTY sessions, and IPC listeners alive
          so background agents continue working while the user switches
          between sessions, projects, workspaces, and overlay views.
          In multi mode, these stay hidden — MultiViewLayout renders its own ChatInterfaces. */}
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        style={{ display: showOverlay || isMultiMode ? 'none' : undefined }}
      >
        {allProjects.map((project) => {
          const tasks = project.tasks || [];
          const isSelectedProject = selectedProject ? project.id === selectedProject.id : false;

          return tasks.map((task) => {
            const isActive = showProjectView && isSelectedProject && task.id === activeTask?.id;
            const isMultiAgent = task.metadata?.multiAgent?.enabled;

            return (
              <div
                key={task.id}
                className="h-full min-h-0 flex-col overflow-hidden"
                style={{ display: isActive ? 'flex' : 'none' }}
              >
                {isMultiAgent ? (
                  <MultiAgentTask
                    task={task}
                    projectName={project.name}
                    projectId={project.id}
                    projectPath={project.path}
                    defaultBranch={isSelectedProject ? projectDefaultBranch : undefined}
                  />
                ) : (
                  <ChatInterface
                    task={task}
                    isActive={isActive}
                    projectName={project.name}
                    projectPath={project.path}
                    defaultBranch={isSelectedProject ? projectDefaultBranch : undefined}
                    className="h-full min-h-0"
                    initialAgent={isActive ? activeTaskAgent || undefined : undefined}
                    suppressTerminal={isMultiMode}
                  />
                )}
              </div>
            );
          });
        })}

        {/* Project landing page when no task is selected */}
        {showProjectView && !activeTask && selectedProject && (
          <ProjectMainView
            project={selectedProject}
            onCreateTask={() => setShowTaskModal(true)}
            activeTask={activeTask}
            onSelectTask={handleSelectTask}
            onDeleteTask={handleDeleteTask}
            onArchiveTask={handleArchiveTask}
            onDeleteProject={handleDeleteProject}
            branchOptions={projectBranchOptions}
            isLoadingBranches={isLoadingBranches}
            onBaseBranchChange={setProjectDefaultBranch}
          />
        )}
      </div>

      {/* Fallback when no project is selected and no overlay is active */}
      {!selectedProject && !showOverlay && !isMultiMode && null}
    </>
  );
};

export default MainContentArea;
