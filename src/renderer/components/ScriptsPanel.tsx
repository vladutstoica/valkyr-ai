import React, { useState, useEffect, useCallback } from 'react';
import { Play, Square, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { ScrollArea } from './ui/scroll-area';

// Type definitions for the API methods that don't exist yet
interface PackageScript {
  name: string;
  command: string;
}

interface GetScriptsResult {
  success: boolean;
  data?: PackageScript[];
  error?: string;
}

interface RunScriptResult {
  success: boolean;
  data?: { ptyId: string };
  error?: string;
}

interface StopScriptResult {
  success: boolean;
  error?: string;
}

// Type for the extended electronAPI with script methods
// These methods will be added to the main process in the future
interface ScriptsElectronAPI {
  getScripts?: (projectPath: string) => Promise<GetScriptsResult>;
  runScript?: (projectPath: string, scriptName: string) => Promise<RunScriptResult>;
  stopScript?: (ptyId: string) => Promise<StopScriptResult>;
}

// Helper to access script-related API methods
const getScriptsAPI = (): ScriptsElectronAPI => {
  return window.electronAPI as unknown as ScriptsElectronAPI;
};

export interface RunningScript {
  name: string;
  ptyId: string;
}

interface ScriptsPanelProps {
  projectPath: string;
  /** Controlled running scripts state */
  runningScripts: Map<string, RunningScript>;
  /** Called when a script starts running */
  onScriptStart: (scriptName: string, ptyId: string) => void;
  /** Called when a script stops */
  onScriptStop: (scriptName: string) => void;
  /** Called when user clicks on a running script (to focus terminal) */
  onScriptClick?: (scriptName: string, ptyId: string) => void;
}

export const ScriptsPanel: React.FC<ScriptsPanelProps> = ({
  projectPath,
  runningScripts,
  onScriptStart,
  onScriptStop,
  onScriptClick,
}) => {
  const [scripts, setScripts] = useState<PackageScript[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const fetchScripts = useCallback(async () => {
    const api = getScriptsAPI();
    if (!projectPath || !api.getScripts) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.getScripts(projectPath);
      if (result.success && result.data) {
        setScripts(result.data);
      } else {
        setError(result.error || 'Failed to load scripts');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scripts');
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const handleRunScript = useCallback(
    async (scriptName: string) => {
      const api = getScriptsAPI();
      if (!api.runScript) {
        console.error('runScript API not available');
        return;
      }

      try {
        const result = await api.runScript(projectPath, scriptName);
        if (result.success && result.data?.ptyId) {
          onScriptStart(scriptName, result.data.ptyId);
        } else {
          console.error('Failed to run script:', result.error);
        }
      } catch (err) {
        console.error('Error running script:', err);
      }
    },
    [projectPath, onScriptStart]
  );

  const handleStopScript = useCallback(
    async (scriptName: string) => {
      const api = getScriptsAPI();
      const running = runningScripts.get(scriptName);
      if (!running || !api.stopScript) {
        return;
      }

      try {
        const result = await api.stopScript(running.ptyId);
        if (result.success) {
          onScriptStop(scriptName);
        } else {
          console.error('Failed to stop script:', result.error);
        }
      } catch (err) {
        console.error('Error stopping script:', err);
      }
    },
    [runningScripts, onScriptStop]
  );

  const isScriptRunning = useCallback(
    (scriptName: string) => runningScripts.has(scriptName),
    [runningScripts]
  );

  if (scripts.length === 0 && !isLoading && !error) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group/scripts flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5" />
            <span>Scripts</span>
            {scripts.length > 0 && (
              <span className="text-[10px] text-muted-foreground">({scripts.length})</span>
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 transition-transform" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 transition-transform" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-2 pb-2">
          {isLoading && (
            <div className="py-2 text-center text-xs text-muted-foreground">Loading scripts...</div>
          )}

          {error && (
            <div className="py-2 text-center text-xs text-destructive">{error}</div>
          )}

          {!isLoading && !error && scripts.length === 0 && (
            <div className="py-2 text-center text-xs text-muted-foreground">
              No scripts found in package.json
            </div>
          )}

          {!isLoading && scripts.length > 0 && (
            <ScrollArea className="max-h-48">
              <div className="space-y-0.5">
                {scripts.map((script) => {
                  const isRunning = isScriptRunning(script.name);

                  return (
                    <div
                      key={script.name}
                      className={`group/script flex items-center justify-between rounded px-2 py-1 hover:bg-accent ${isRunning ? 'cursor-pointer' : ''}`}
                      onClick={() => {
                        if (isRunning) {
                          const running = runningScripts.get(script.name);
                          if (running && onScriptClick) {
                            onScriptClick(script.name, running.ptyId);
                          }
                        }
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {/* Running indicator */}
                        {isRunning ? (
                          <span
                            className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-500"
                            title="Running - Click to view output"
                          />
                        ) : (
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500 opacity-50"
                            title="Ready"
                          />
                        )}

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-foreground">
                                  {script.name}
                                </span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {script.command}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-medium">{script.name}</p>
                                <code className="block whitespace-pre-wrap text-[10px]">
                                  {script.command}
                                </code>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* Play/Stop button */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0 opacity-0 transition-opacity group-hover/script:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isRunning) {
                                  handleStopScript(script.name);
                                } else {
                                  handleRunScript(script.name);
                                }
                              }}
                            >
                              {isRunning ? (
                                <Square className="h-3 w-3 text-destructive" />
                              ) : (
                                <Play className="h-3 w-3 text-green-500" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {isRunning ? 'Stop script' : 'Run script'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ScriptsPanel;
