import React from 'react';
import ChatInterface from '../chat/ChatInterface';
import type { Project, Task } from '../../types/app';

interface MultiViewPaneProps {
  task: Task;
  project: Project;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
}

export const MultiViewPane: React.FC<MultiViewPaneProps> = ({
  task,
  project,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onRemove,
}) => {
  return (
    <ChatInterface
      task={task}
      isActive={true}
      projectName={project.name}
      projectPath={project.path}
      defaultBranch={project.gitInfo?.baseRef || project.gitInfo?.branch}
      className="h-full min-h-0"
      multiView={{
        projectLabel: project.name,
        canMoveLeft,
        canMoveRight,
        onMoveLeft,
        onMoveRight,
        onRemove,
      }}
    />
  );
};
