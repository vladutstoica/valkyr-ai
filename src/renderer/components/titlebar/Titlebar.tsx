import React from 'react';
import TitlebarContext from './TitlebarContext';
import type { Project, Task } from '../../types/app';

interface TitlebarProps {
  onToggleSettings: () => void;
  isSettingsOpen?: boolean;
  currentPath?: string | null;
  projects: Project[];
  selectedProject: Project | null;
  activeTask: Task | null;
  onSelectProject: (project: Project) => void;
  onSelectTask: (task: Task) => void;
}

const Titlebar: React.FC<TitlebarProps> = ({
  selectedProject,
  projects,
  activeTask,
  onSelectProject,
  onSelectTask,
}) => {
  return (
    <header className="border-border bg-muted dark:bg-background fixed inset-x-0 top-0 z-[80] flex h-[var(--tb,36px)] items-center justify-end border-b pr-2 [-webkit-app-region:drag]">
      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <div className="w-[min(60vw,720px)]">
          <TitlebarContext
            projects={projects}
            selectedProject={selectedProject}
            activeTask={activeTask}
            onSelectProject={onSelectProject}
            onSelectTask={onSelectTask}
          />
        </div>
      </div>
    </header>
  );
};

export default Titlebar;
