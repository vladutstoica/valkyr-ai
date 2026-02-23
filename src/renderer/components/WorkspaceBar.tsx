import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import type { Workspace } from '../types/app';

interface WorkspaceBarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSwitchWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (name: string, color: string) => void;
  onRenameWorkspace: (workspaceId: string, name: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onUpdateWorkspaceColor: (workspaceId: string, color: string) => void;
  onReorderWorkspaces?: (workspaceIds: string[]) => void;
}

const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onReorderWorkspaces,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (isCreating && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [isCreating]);

  // Ctrl+1..9 to switch workspaces
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= workspaces.length) {
        e.preventDefault();
        onSwitchWorkspace(workspaces[num - 1].id);
      }
    },
    [workspaces, onSwitchWorkspace]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCreateSubmit = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onCreateWorkspace(trimmed, 'blue');
    }
    setNewName('');
    setIsCreating(false);
  };

  const handleRenameSubmit = () => {
    if (editingId) {
      const trimmed = editName.trim();
      if (trimmed) {
        onRenameWorkspace(editingId, trimmed);
      }
      setEditingId(null);
      setEditName('');
    }
  };

  const startRename = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditName(ws.name);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdRef.current && dragIdRef.current !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    if (!sourceId || sourceId === targetId || !onReorderWorkspaces) return;
    const ids = workspaces.map((ws) => ws.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);
    onReorderWorkspaces(ids);
  };

  const handleDragEnd = () => {
    dragIdRef.current = null;
    setDragOverId(null);
  };

  // Always show the bar so users can create workspaces via the + button
  if (workspaces.length === 0) return null;

  return (
    <div className="border-border/50 flex h-9 shrink-0 items-center justify-center border-t px-3">
      <div className="flex items-center justify-center gap-0.5">
        <TooltipProvider delayDuration={300}>
          {workspaces.map((ws, index) => {
            const isActive = ws.id === activeWorkspaceId || (!activeWorkspaceId && ws.isDefault);

            return (
              <ContextMenu key={ws.id}>
                <ContextMenuTrigger>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        draggable
                        onDragStart={(e) => handleDragStart(e, ws.id)}
                        onDragOver={(e) => handleDragOver(e, ws.id)}
                        onDrop={(e) => handleDrop(e, ws.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onSwitchWorkspace(ws.id)}
                        className={`h-6 w-6 cursor-pointer ${
                          isActive ? 'bg-muted-foreground/20' : 'opacity-50 hover:opacity-80'
                        } ${dragOverId === ws.id ? 'ring-muted-foreground/40 ring-1' : ''}`}
                      >
                        <div className="bg-muted-foreground/60 h-2.5 w-2.5 rounded-sm" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {ws.emoji ? `${ws.emoji} ` : ''}
                      {ws.name}
                      <span className="text-muted-foreground ml-1.5">Ctrl+{index + 1}</span>
                    </TooltipContent>
                  </Tooltip>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {editingId === ws.id ? (
                    <div className="px-2 py-1.5">
                      <Input
                        ref={editInputRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={handleRenameSubmit}
                        className="h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <ContextMenuItem onClick={() => startRename(ws)}>Rename</ContextMenuItem>
                  )}
                  <ContextMenuItem
                    disabled={ws.isDefault}
                    onClick={() => onDeleteWorkspace(ws.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          <Popover open={isCreating} onOpenChange={setIsCreating}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer">
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-56 p-3" align="center">
              <Input
                ref={newInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                placeholder="Workspace name"
                className="h-7 text-xs"
              />
            </PopoverContent>
          </Popover>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default WorkspaceBar;
