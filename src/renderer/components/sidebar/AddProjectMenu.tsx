import React from 'react';
import { Plus, FolderOpen, Github, Server } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface AddProjectMenuProps {
  onOpenProject: () => void;
  onNewProject?: () => void;
  onCloneProject?: () => void;
  onAddRemoteProject?: () => void;
}

export function AddProjectMenu({
  onOpenProject,
  onNewProject,
  onCloneProject,
  onAddRemoteProject,
}: AddProjectMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex-1">
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={onOpenProject}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Open Folder
        </DropdownMenuItem>
        {onNewProject && (
          <DropdownMenuItem onClick={onNewProject}>
            <Plus className="mr-2 h-4 w-4" />
            Create New
          </DropdownMenuItem>
        )}
        {onCloneProject && (
          <DropdownMenuItem onClick={onCloneProject}>
            <Github className="mr-2 h-4 w-4" />
            Clone from GitHub
          </DropdownMenuItem>
        )}
        {onAddRemoteProject && (
          <DropdownMenuItem onClick={onAddRemoteProject}>
            <Server className="mr-2 h-4 w-4" />
            Add Remote Project
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
