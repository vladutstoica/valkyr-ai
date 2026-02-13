import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  useTerminalPanel,
  type TerminalType,
} from '../../hooks/useTerminalPanel';
import { useTerminalShortcut } from '../../hooks/useTerminalShortcut';

interface TerminalOption {
  value: TerminalType;
  label: string;
  group?: 'task' | 'global' | 'scripts';
}

interface TerminalPanelProps {
  /** Additional CSS classes */
  className?: string;
  /** Available terminal options */
  terminals?: TerminalOption[];
  /** Custom content to render in the terminal area */
  children?: React.ReactNode;
  /** Callback when terminal selection changes */
  onTerminalChange?: (terminal: TerminalType) => void;
}

const COLLAPSED_HEIGHT = 32;

/**
 * Status indicator component
 */
function StatusIndicator({ status }: { status: 'idle' | 'working' }) {
  if (status === 'working') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        Working...
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
      Idle
    </span>
  );
}

/**
 * Collapsible terminal panel component
 *
 * Features:
 * - Collapsible with smooth animation
 * - Terminal selector dropdown
 * - Status indicator (Working/Idle)
 * - Keyboard shortcut: Cmd+` (Mac) or Ctrl+` (Windows/Linux)
 */
export function TerminalPanel({
  className,
  terminals = [
    { value: 'task', label: 'Task Terminal', group: 'task' },
    { value: 'global', label: 'Global Terminal', group: 'global' },
  ],
  children,
  onTerminalChange,
}: TerminalPanelProps) {
  const {
    isCollapsed,
    height,
    activeTerminal,
    status,
    toggleCollapsed,
    setActiveTerminal,
  } = useTerminalPanel();

  // Register keyboard shortcut
  useTerminalShortcut();

  // Track focus state for visual indicator
  const [hasFocus, setHasFocus] = useState(false);

  const handleTerminalChange = useCallback(
    (value: string) => {
      setActiveTerminal(value as TerminalType);
      onTerminalChange?.(value as TerminalType);
    },
    [setActiveTerminal, onTerminalChange]
  );

  const activeTerminalLabel =
    terminals.find((t) => t.value === activeTerminal)?.label ?? 'Terminal';

  // Group terminals by category
  const taskTerminals = terminals.filter((t) => t.group === 'task');
  const globalTerminals = terminals.filter((t) => t.group === 'global');
  const scriptTerminals = terminals.filter((t) => t.group === 'scripts');

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col border-t border-border bg-background transition-all duration-200',
        isCollapsed ? 'h-8' : 'h-64',
        className
      )}
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        // Only remove focus if focus moved outside this panel
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHasFocus(false);
        }
      }}
    >
      {/* Focus indicator border */}
      {hasFocus && !isCollapsed && (
        <div
          className="pointer-events-none absolute inset-0 z-50 rounded-sm border-2 border-primary/50"
          aria-hidden="true"
        />
      )}
      {/* Header bar - always visible */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-muted px-3">
        {/* Left side: Terminal label and selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span>Terminal</span>
          </div>

          {!isCollapsed && (
            <Select value={activeTerminal} onValueChange={handleTerminalChange}>
              <SelectTrigger className="h-6 min-w-[120px] border-none bg-transparent px-2 text-xs shadow-none">
                <SelectValue placeholder="Select terminal" />
              </SelectTrigger>
              <SelectContent>
                {taskTerminals.length > 0 && (
                  <SelectGroup>
                    <div className="px-2 py-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Task
                      </span>
                    </div>
                    {taskTerminals.map((terminal) => (
                      <SelectItem
                        key={terminal.value}
                        value={terminal.value}
                        className="text-xs"
                      >
                        {terminal.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}

                {globalTerminals.length > 0 && (
                  <SelectGroup>
                    <div className="px-2 py-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Global
                      </span>
                    </div>
                    {globalTerminals.map((terminal) => (
                      <SelectItem
                        key={terminal.value}
                        value={terminal.value}
                        className="text-xs"
                      >
                        {terminal.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}

                {scriptTerminals.length > 0 && (
                  <SelectGroup>
                    <div className="px-2 py-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Scripts
                      </span>
                    </div>
                    {scriptTerminals.map((terminal) => (
                      <SelectItem
                        key={terminal.value}
                        value={terminal.value}
                        className="text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                          {terminal.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Center: Status indicator (collapsed view) */}
        {isCollapsed && (
          <div className="flex flex-1 items-center justify-center">
            <span className="mx-4 text-muted-foreground/30">---</span>
            <StatusIndicator status={status} />
          </div>
        )}

        {/* Right side: Collapse toggle */}
        <div className="flex items-center gap-1">
          {!isCollapsed && <StatusIndicator status={status} />}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Expand terminal (Cmd+`)' : 'Collapse terminal (Cmd+`)'}
          >
            {isCollapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Content area - only visible when expanded */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden">
          {children ?? (
            <div className="flex h-full items-center justify-center bg-card text-muted-foreground">
              <div className="text-center">
                <Terminal className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">Terminal content will appear here</p>
                <p className="mt-1 text-xs opacity-70">
                  Active: {activeTerminalLabel}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TerminalPanel;
