import React from 'react';
import ChatInterface from './ChatInterface';
import MultiAgentTask from './MultiAgentTask';
import ProjectMainView from './ProjectMainView';
import HomeView from './HomeView';
import SkillsView from './skills/SkillsView';
import type { Agent } from '../types';
import type { Project, Task } from '../types/app';

interface MainContentAreaProps {
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
        {activeTask ? (
          (activeTask.metadata as any)?.multiAgent?.enabled ? (
            <MultiAgentTask
              task={activeTask}
              projectName={selectedProject.name}
              projectId={selectedProject.id}
              projectPath={selectedProject.path}
              defaultBranch={projectDefaultBranch}
            />
          ) : (
            <ChatInterface
              key={activeTask.id}
              task={activeTask}
              projectName={selectedProject.name}
              projectPath={selectedProject.path}
              defaultBranch={projectDefaultBranch}
              className="h-full min-h-0"
              initialAgent={activeTaskAgent || undefined}
            />
          )
        ) : (
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
