import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, Terminal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { useTerminalPanel } from '../../hooks/useTerminalPanel';
import { useTerminalShortcut } from '../../hooks/useTerminalShortcut';
import { useTaskTerminals } from '@/lib/taskTerminalsStore';
import { TerminalPane } from '../TerminalPane';
import { useTheme } from '../../hooks/useTheme';

interface TerminalPanelProps {
  /** Additional CSS classes */
  className?: string;
  /** Task/session path (worktree path) */
  taskPath?: string;
  /** Task/session ID */
  taskId?: string;
  /** Project path (for fallback when no task selected) */
  projectPath?: string;
  /** Custom content to render instead of terminal (deprecated) */
  children?: React.ReactNode;
}

/**
 * Terminal tab component - styled like main TabBar
 */
function TerminalTab({
  title,
  isActive,
  isRunning,
  canClose,
  onClick,
  onClose,
}: {
  title: string;
  isActive: boolean;
  isRunning?: boolean;
  canClose: boolean;
  onClick: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {isRunning ? (
        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
      ) : (
        <Terminal className="h-4 w-4" />
      )}
      <span className="max-w-[120px] truncate">{title}</span>
      {canClose && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              onClose();
            }
          }}
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded transition-colors',
            isActive
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground'
          )}
        >
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/**
 * Collapsible terminal panel with tab bar
 *
 * Features:
 * - Collapsible with smooth animation
 * - Horizontal tab bar for multiple terminals (styled like main TabBar)
 * - Auto-creates terminal when panel opens and none exists
 * - Keyboard shortcut: Cmd+` (Mac) or Ctrl+` (Windows/Linux)
 */
export function TerminalPanel({
  className,
  taskPath,
  taskId,
  projectPath,
  children,
}: TerminalPanelProps) {
  const { effectiveTheme } = useTheme();
  const { isCollapsed, toggleCollapsed } = useTerminalPanel();

  // Register keyboard shortcut
  useTerminalShortcut();

  // Determine the terminal store key and cwd
  const terminalKey = taskId ? `bottom::${taskId}::${taskPath}` : 'bottom::project';
  const terminalCwd = taskPath || projectPath;

  // Use the task terminals store
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    setActiveTerminal,
    closeTerminal,
  } = useTaskTerminals(terminalKey, terminalCwd);

  // Track focus state for visual indicator
  const [hasFocus, setHasFocus] = useState(false);

  // Auto-create terminal when panel opens and no terminal exists
  useEffect(() => {
    if (!isCollapsed && terminals.length === 0 && terminalCwd) {
      createTerminal({ cwd: terminalCwd });
    }
  }, [isCollapsed, terminals.length, terminalCwd, createTerminal]);

  const handleCreateTerminal = useCallback(() => {
    if (terminalCwd) {
      createTerminal({ cwd: terminalCwd });
    }
  }, [terminalCwd, createTerminal]);

  const handleCloseTerminal = useCallback(
    (terminalId: string) => {
      if (terminals.length > 1) {
        closeTerminal(terminalId);
      }
    },
    [terminals.length, closeTerminal]
  );

  // Track which terminals are actively running a command.
  // Only shows spinner after 3s of continuous PTY output to avoid false
  // positives from shell prompts and short command responses.
  const [runningTerminals, setRunningTerminals] = useState<Set<string>>(new Set());
  const activationTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const terminal of terminals) {
      const offData = window.electronAPI?.onPtyData?.(terminal.id, () => {
        const tid = terminal.id;

        // Start activation timer on first data after silence (3s threshold)
        if (!activationTimers.current.has(tid)) {
          activationTimers.current.set(
            tid,
            setTimeout(() => {
              setRunningTerminals((prev) => {
                if (prev.has(tid)) return prev;
                const next = new Set(prev);
                next.add(tid);
                return next;
              });
              activationTimers.current.delete(tid);
            }, 3000)
          );
        }

        // Reset idle timer — clears running state after 2s of silence
        const existingIdle = idleTimers.current.get(tid);
        if (existingIdle) clearTimeout(existingIdle);
        idleTimers.current.set(
          tid,
          setTimeout(() => {
            // Cancel pending activation if command finished quickly
            const pending = activationTimers.current.get(tid);
            if (pending) {
              clearTimeout(pending);
              activationTimers.current.delete(tid);
            }
            setRunningTerminals((prev) => {
              if (!prev.has(tid)) return prev;
              const next = new Set(prev);
              next.delete(tid);
              return next;
            });
            idleTimers.current.delete(tid);
          }, 2000)
        );
      });
      if (offData) cleanups.push(offData);
    }
    return () => {
      cleanups.forEach((fn) => fn());
      for (const timer of activationTimers.current.values()) clearTimeout(timer);
      for (const timer of idleTimers.current.values()) clearTimeout(timer);
      activationTimers.current.clear();
      idleTimers.current.clear();
    };
  }, [terminals]);

  // Get theme configuration
  const themeOverride = useMemo(() => {
    const isDark = effectiveTheme === 'dark' || effectiveTheme === 'dark-black';
    const isBlack = effectiveTheme === 'dark-black';
    const darkBackground = isBlack ? '#000000' : '#1e1e1e';

    return isDark
      ? {
          background: darkBackground,
          foreground: '#d4d4d4',
          cursor: '#aeafad',
          cursorAccent: darkBackground,
          selectionBackground: 'rgba(96, 165, 250, 0.35)',
          selectionForeground: '#f9fafb',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#ffffff',
        }
      : {
          background: '#ffffff',
          foreground: '#1e1e1e',
          cursor: '#1e1e1e',
          cursorAccent: '#ffffff',
          selectionBackground: 'rgba(59, 130, 246, 0.35)',
          selectionForeground: '#0f172a',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#bf8803',
          blue: '#0451a5',
          magenta: '#bc05bc',
          cyan: '#0598bc',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#cd3131',
          brightGreen: '#14ce14',
          brightYellow: '#b5ba00',
          brightBlue: '#0451a5',
          brightMagenta: '#bc05bc',
          brightCyan: '#0598bc',
          brightWhite: '#a5a5a5',
        };
  }, [effectiveTheme]);

  // If children are provided (legacy usage), render them instead
  if (children) {
    return (
      <div
        className={cn(
          'relative flex shrink-0 flex-col border-t border-border bg-background transition-all duration-200',
          isCollapsed ? 'h-9' : 'h-64',
          className
        )}
      >
        <div
          className="flex h-9 shrink-0 cursor-pointer items-center justify-between border-b border-border bg-muted/30 px-3"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button')) return;
            toggleCollapsed();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleCollapsed();
            }
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Terminal className="h-4 w-4" />
            <span>Terminal</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed();
            }}
            title={isCollapsed ? 'Expand terminal (Cmd+`)' : 'Collapse terminal (Cmd+`)'}
          >
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        {!isCollapsed && <div className="flex-1 overflow-hidden">{children}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col border-t border-border bg-background transition-all duration-200',
        isCollapsed ? 'h-9' : 'h-64',
        className
      )}
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHasFocus(false);
        }
      }}
    >
      {/* Focus indicator ring */}
      {hasFocus && !isCollapsed && (
        <div
          className="pointer-events-none absolute inset-0 z-50 ring-1 ring-inset ring-white/15"
          aria-hidden="true"
        />
      )}

      {/* Tab bar - styled like main TabBar */}
      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-muted/30"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('[role="button"]')) return;
          toggleCollapsed();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
      >
        {/* Tabs */}
        <div className="flex items-center overflow-x-auto">
          {terminals.map((terminal) => (
            <TerminalTab
              key={terminal.id}
              title={terminal.title}
              isActive={terminal.id === activeTerminalId}
              isRunning={runningTerminals.has(terminal.id)}
              canClose={terminals.length > 1}
              onClick={() => {
                setActiveTerminal(terminal.id);
                if (isCollapsed) toggleCollapsed();
              }}
              onClose={() => handleCloseTerminal(terminal.id)}
            />
          ))}

          {/* Add new terminal button */}
          {terminalCwd && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCreateTerminal();
              }}
              className="flex items-center px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
              title="New terminal"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right side: Collapse toggle */}
        <div className="flex items-center px-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed();
            }}
            title={isCollapsed ? 'Expand terminal (Cmd+`)' : 'Collapse terminal (Cmd+`)'}
          >
            {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Content area - only visible when expanded */}
      {!isCollapsed && (
        <div
          className={cn(
            'relative flex-1 overflow-hidden',
            effectiveTheme === 'dark' || effectiveTheme === 'dark-black' ? 'bg-card' : 'bg-white'
          )}
        >
          {terminals.length === 0 || !terminalCwd ? (
            <div className="flex h-full items-center justify-center bg-card text-muted-foreground">
              <div className="text-center">
                <Terminal className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">
                  {terminalCwd ? 'Starting terminal...' : 'Select a session to open terminal'}
                </p>
              </div>
            </div>
          ) : (
            terminals.map((terminal) => {
              const isActive = terminal.id === activeTerminalId;
              return (
                <div
                  key={terminal.id}
                  className={cn(
                    'absolute inset-0 transition-opacity',
                    isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
                  )}
                >
                  <TerminalPane
                    id={terminal.id}
                    cwd={terminal.cwd || terminalCwd}
                    variant={
                      effectiveTheme === 'dark' || effectiveTheme === 'dark-black' ? 'dark' : 'light'
                    }
                    themeOverride={themeOverride}
                    className="h-full w-full"
                    keepAlive
                  />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default TerminalPanel;
