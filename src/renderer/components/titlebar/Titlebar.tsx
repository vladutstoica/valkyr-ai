import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import TitlebarContext from './TitlebarContext';
import { ModeToggle } from './ModeToggle';
import { useTheme } from '../../hooks/useTheme';
import logomarkWhite from '../../../assets/images/valkyr/logomark-white.png';
import logomarkBlack from '../../../assets/images/valkyr/logomark-black.png';
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
  onToggleSettings,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark' || effectiveTheme === 'dark-black';

  useEffect(() => {
    const unsubscribe = window.electronAPI.onFullscreenChanged((fs) => {
      setIsFullscreen(fs);
    });
    return unsubscribe;
  }, []);

  return (
    <header className="border-border/50 bg-muted dark:bg-background fixed inset-x-0 top-0 z-[80] flex h-[var(--tb,44px)] items-center justify-between border-b px-4 [-webkit-app-region:drag]">
      {/* Left: Logo + Mode toggle — offset for macOS traffic lights (collapse in fullscreen) */}
      <div
        className={`flex items-center gap-3 ${isFullscreen ? 'pl-2' : 'pl-[76px]'} [-webkit-app-region:no-drag]`}
      >
        <img
          src={isDark ? logomarkWhite : logomarkBlack}
          alt="Valkyr"
          className="h-5 w-5 object-contain"
        />
        <ModeToggle />
      </div>

      {/* Center: Project / Task selectors */}
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

      {/* Right: settings */}
      <div className="flex items-center [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={onToggleSettings}
          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-2 transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};

export default Titlebar;
