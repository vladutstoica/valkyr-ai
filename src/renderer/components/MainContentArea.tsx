import React from 'react';
import ChatInterface from './ChatInterface';
import MultiAgentTask from './MultiAgentTask';
import ProjectMainView from './ProjectMainView';
import HomeView from './HomeView';
import SkillsView from './skills/SkillsView';
import type { Agent } from '../types';
import type { Project, Task } from '../types/app';

interface MainContentAreaProps {
  allProjects: Project[];
  selectedProject: Project | null;
  activeTask: Task | null;
  activeTaskAgent: Agent | null;
  showHomeView: boolean;
  showSkillsView: boolean;
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
  if (showSkillsView) {
    return <SkillsView />;
  }

  if (showHomeView) {
    return (
      <HomeView
        onOpenProject={handleOpenProject}
        onNewProjectClick={handleNewProjectClick}
        onCloneProjectClick={handleCloneProjectClick}
        onAddRemoteProject={handleAddRemoteProject}
      />
    );
  }

  if (selectedProject) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Render tasks from ALL projects simultaneously — hidden when inactive.
            This keeps ACP transports, useChat state, and IPC listeners alive
            so background agents continue working while the user switches
            between sessions, projects, and workspaces. */}
        {allProjects.map((project) => {
          const tasks = project.tasks || [];
          const isSelectedProject = project.id === selectedProject.id;

          return tasks.map((task) => {
            const isActive = isSelectedProject && task.id === activeTask?.id;
            const isMultiAgent = (task.metadata as any)?.multiAgent?.enabled;

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
        {!activeTask && (
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
    );
  }

  return null;
};

export default MainContentArea;
