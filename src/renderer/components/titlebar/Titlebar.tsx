import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { ShortcutHint } from '../ui/shortcut-hint';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import OpenInMenu from './OpenInMenu';
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
  onToggleSettings,
  isSettingsOpen = false,
  currentPath,
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
      <div className="pointer-events-auto flex items-center gap-1 [-webkit-app-region:no-drag]">
        {currentPath ? (
          <OpenInMenu
            path={currentPath}
            align="right"
            isRemote={selectedProject?.isRemote || false}
            sshConnectionId={selectedProject?.sshConnectionId || null}
          />
        ) : null}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isSettingsOpen ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="Open settings"
                aria-pressed={isSettingsOpen}
                onClick={async () => {
                  void import('../../lib/telemetryClient').then(({ captureTelemetry }) => {
                    captureTelemetry('toolbar_settings_clicked');
                  });
                  onToggleSettings();
                }}
                className="text-muted-foreground hover:bg-background/80 h-8 w-8"
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-medium">
              <div className="flex flex-col gap-1">
                <span>Open settings</span>
                <ShortcutHint settingsKey="settings" />
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
};

export default Titlebar;
