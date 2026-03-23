import React from 'react';
import ChatInterface from './chat/ChatInterface';
import MultiAgentTask from './project/MultiAgentTask';
import ProjectMainView from './ProjectMainView';
import HomeView from './HomeView';
import SkillsView from './skills/SkillsView';
import SettingsView from './settings/SettingsView';
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
  handleDeleteProject: (project: Project) => Promise<void>;
  handleOpenProject: () => void;
  handleNewProjectClick: () => void;
  handleCloneProjectClick: () => void;
  handleAddRemoteProject: () => void;
  setShowTaskModal: (show: boolean) => void;
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
  handleDeleteProject,
  handleOpenProject,
  handleNewProjectClick,
  handleCloneProjectClick,
  handleAddRemoteProject,
  setShowTaskModal,
}) => {
  // Determine which overlay view is active (if any).
  // Task components are ALWAYS kept mounted underneath to preserve
  // ACP transports, PTY sessions, useChat state, and IPC listeners.
  const showOverlay = showSettingsView || showSkillsView || showHomeView;
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
      {showSkillsView && <SkillsView />}
      {showHomeView && !showSettingsView && !showSkillsView && <HomeView />}

      {/* Task components — always mounted, hidden when an overlay or different task is active.
          This keeps ACP transports, useChat state, PTY sessions, and IPC listeners alive
          so background agents continue working while the user switches
          between sessions, projects, workspaces, and overlay views. */}
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        style={{ display: showOverlay ? 'none' : undefined }}
      >
        {allProjects.map((project) => {
          const tasks = project.tasks || [];
          const isSelectedProject = selectedProject
            ? project.id === selectedProject.id
            : false;

          return tasks.map((task) => {
            const isActive =
              showProjectView && isSelectedProject && task.id === activeTask?.id;
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
      {!selectedProject && !showOverlay && null}
    </>
  );
};

export default MainContentArea;
