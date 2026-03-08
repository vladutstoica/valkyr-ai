import React from 'react';
import { Layers } from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuItem,
} from '../ui/context-menu';
import type { ProjectGroup, Workspace } from '../../types/app';

type MenuVariant = 'dropdown' | 'context';

interface MoveToGroupMenuProps {
  variant: MenuVariant;
  projectId: string;
  currentGroupId?: string | null;
  groups: ProjectGroup[];
  onMoveProjectToGroup: (projectId: string, groupId: string | null) => void | Promise<void>;
}

export function MoveToGroupMenu({
  variant,
  projectId,
  currentGroupId,
  groups,
  onMoveProjectToGroup,
}: MoveToGroupMenuProps) {
  if (groups.length === 0) return null;

  const iconSize = variant === 'dropdown' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const Sub = variant === 'dropdown' ? DropdownMenuSub : ContextMenuSub;
  const SubTrigger = variant === 'dropdown' ? DropdownMenuSubTrigger : ContextMenuSubTrigger;
  const SubContent = variant === 'dropdown' ? DropdownMenuSubContent : ContextMenuSubContent;
  const Item = variant === 'dropdown' ? DropdownMenuItem : ContextMenuItem;

  return (
    <Sub>
      <SubTrigger className="cursor-pointer">
        <Layers className={`mr-2 ${iconSize}`} />
        Move to Group
      </SubTrigger>
      <SubContent>
        {currentGroupId && (
          <Item className="cursor-pointer" onClick={() => onMoveProjectToGroup(projectId, null)}>
            No Group
          </Item>
        )}
        {groups.map((g) => (
          <Item
            key={g.id}
            className="cursor-pointer"
            disabled={currentGroupId === g.id}
            onClick={() => onMoveProjectToGroup(projectId, g.id)}
          >
            {g.name}
          </Item>
        ))}
      </SubContent>
    </Sub>
  );
}

interface MoveToWorkspaceMenuProps {
  variant: MenuVariant;
  projectId: string;
  currentWorkspaceId?: string | null;
  workspaces: Workspace[];
  onMoveProjectToWorkspace: (projectId: string, workspaceId: string) => void | Promise<void>;
}

export function MoveToWorkspaceMenu({
  variant,
  projectId,
  currentWorkspaceId,
  workspaces,
  onMoveProjectToWorkspace,
}: MoveToWorkspaceMenuProps) {
  if (workspaces.length <= 1) return null;

  const iconSize = variant === 'dropdown' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const Sub = variant === 'dropdown' ? DropdownMenuSub : ContextMenuSub;
  const SubTrigger = variant === 'dropdown' ? DropdownMenuSubTrigger : ContextMenuSubTrigger;
  const SubContent = variant === 'dropdown' ? DropdownMenuSubContent : ContextMenuSubContent;
  const Item = variant === 'dropdown' ? DropdownMenuItem : ContextMenuItem;

  return (
    <Sub>
      <SubTrigger className="cursor-pointer">
        <Layers className={`mr-2 ${iconSize}`} />
        Move to Workspace
      </SubTrigger>
      <SubContent>
        {workspaces.map((ws) => (
          <Item
            key={ws.id}
            className="cursor-pointer"
            disabled={currentWorkspaceId === ws.id || (!currentWorkspaceId && ws.isDefault)}
            onClick={() => onMoveProjectToWorkspace(projectId, ws.id)}
          >
            <span className={`mr-2 inline-block h-2 w-2 rounded-full bg-${ws.color}-500`} />
            {ws.name}
          </Item>
        ))}
      </SubContent>
    </Sub>
  );
}
