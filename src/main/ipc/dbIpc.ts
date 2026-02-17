import { ipcMain } from 'electron';
import { log } from '../lib/logger';
import { databaseService } from '../services/DatabaseService';
import fs from 'fs';
import path from 'path';

export function registerDatabaseIpc() {
  ipcMain.handle('db:getProjects', async () => {
    try {
      return await databaseService.getProjects();
    } catch (error) {
      log.error('Failed to get projects:', error);
      return [];
    }
  });

  ipcMain.handle('db:saveProject', async (_, project: any) => {
    try {
      await databaseService.saveProject(project);
      return { success: true };
    } catch (error) {
      log.error('Failed to save project:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:updateProjectOrder', async (_, projectIds: string[]) => {
    try {
      await databaseService.updateProjectOrder(projectIds);
      return { success: true };
    } catch (error) {
      log.error('Failed to update project order:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:getTasks', async (_, projectId?: string) => {
    try {
      return await databaseService.getTasks(projectId);
    } catch (error) {
      log.error('Failed to get tasks:', error);
      return [];
    }
  });

  ipcMain.handle('db:saveTask', async (_, task: any) => {
    try {
      await databaseService.saveTask(task);
      return { success: true };
    } catch (error) {
      log.error('Failed to save task:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:deleteProject', async (_, projectId: string) => {
    try {
      await databaseService.deleteProject(projectId);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete project:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:renameProject',
    async (_, { projectId, newName }: { projectId: string; newName: string }) => {
      try {
        const project = await databaseService.updateProjectName(projectId, newName);
        return { success: true, project };
      } catch (error) {
        log.error('Failed to rename project:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('db:saveConversation', async (_, conversation: any) => {
    try {
      await databaseService.saveConversation(conversation);
      return { success: true };
    } catch (error) {
      log.error('Failed to save conversation:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:getConversations', async (_, taskId: string) => {
    try {
      const conversations = await databaseService.getConversations(taskId);
      return { success: true, conversations };
    } catch (error) {
      log.error('Failed to get conversations:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:getOrCreateDefaultConversation', async (_, taskId: string) => {
    try {
      const conversation = await databaseService.getOrCreateDefaultConversation(taskId);
      return { success: true, conversation };
    } catch (error) {
      log.error('Failed to get or create default conversation:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:saveMessage', async (_, message: any) => {
    try {
      await databaseService.saveMessage(message);
      return { success: true };
    } catch (error) {
      log.error('Failed to save message:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:getMessages', async (_, conversationId: string) => {
    try {
      const messages = await databaseService.getMessages(conversationId);
      return { success: true, messages };
    } catch (error) {
      log.error('Failed to get messages:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:deleteConversation', async (_, conversationId: string) => {
    try {
      await databaseService.deleteConversation(conversationId);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete conversation:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:cleanupSessionDirectory',
    async (_, args: { taskPath: string; conversationId: string }) => {
      try {
        const sessionDir = path.join(args.taskPath, '.valkyr-sessions', args.conversationId);

        // Check if directory exists before trying to remove it
        if (fs.existsSync(sessionDir)) {
          // Remove the directory and its contents
          fs.rmSync(sessionDir, { recursive: true, force: true });
          log.info('Cleaned up session directory:', sessionDir);

          // Also try to remove the parent .valkyr-sessions if it's empty
          const parentDir = path.join(args.taskPath, '.valkyr-sessions');
          try {
            const entries = fs.readdirSync(parentDir);
            if (entries.length === 0) {
              fs.rmdirSync(parentDir);
              log.info('Removed empty .valkyr-sessions directory');
            }
          } catch (err) {
            // Parent directory removal is optional
          }
        }

        return { success: true };
      } catch (error) {
        log.warn('Failed to cleanup session directory:', error);
        // This is best-effort, don't fail the operation
        return { success: true };
      }
    }
  );

  ipcMain.handle('db:deleteTask', async (_, taskId: string) => {
    try {
      await databaseService.deleteTask(taskId);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete task:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:archiveTask', async (_, taskId: string) => {
    try {
      await databaseService.archiveTask(taskId);
      return { success: true };
    } catch (error) {
      log.error('Failed to archive task:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:restoreTask', async (_, taskId: string) => {
    try {
      await databaseService.restoreTask(taskId);
      return { success: true };
    } catch (error) {
      log.error('Failed to restore task:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:getArchivedTasks', async (_, projectId?: string) => {
    try {
      return await databaseService.getArchivedTasks(projectId);
    } catch (error) {
      log.error('Failed to get archived tasks:', error);
      return [];
    }
  });

  // Project group handlers
  ipcMain.handle('db:getProjectGroups', async () => {
    try {
      const groups = await databaseService.getProjectGroups();
      return { success: true, groups };
    } catch (error) {
      log.error('Failed to get project groups:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:createProjectGroup', async (_, name: string) => {
    try {
      const group = await databaseService.createProjectGroup(name);
      return { success: true, group };
    } catch (error) {
      log.error('Failed to create project group:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:renameProjectGroup',
    async (_, { id, name }: { id: string; name: string }) => {
      try {
        await databaseService.renameProjectGroup(id, name);
        return { success: true };
      } catch (error) {
        log.error('Failed to rename project group:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('db:deleteProjectGroup', async (_, id: string) => {
    try {
      await databaseService.deleteProjectGroup(id);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete project group:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:updateProjectGroupOrder', async (_, groupIds: string[]) => {
    try {
      await databaseService.updateProjectGroupOrder(groupIds);
      return { success: true };
    } catch (error) {
      log.error('Failed to update project group order:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:setProjectGroup',
    async (_, { projectId, groupId }: { projectId: string; groupId: string | null }) => {
      try {
        await databaseService.setProjectGroup(projectId, groupId);
        return { success: true };
      } catch (error) {
        log.error('Failed to set project group:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'db:toggleProjectGroupCollapsed',
    async (_, { id, isCollapsed }: { id: string; isCollapsed: boolean }) => {
      try {
        await databaseService.toggleProjectGroupCollapsed(id, isCollapsed);
        return { success: true };
      } catch (error) {
        log.error('Failed to toggle project group collapsed:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Workspace handlers
  ipcMain.handle('db:getWorkspaces', async () => {
    try {
      const workspaces = await databaseService.getWorkspaces();
      return { success: true, workspaces };
    } catch (error) {
      log.error('Failed to get workspaces:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:createWorkspace',
    async (_, { name, color }: { name: string; color?: string }) => {
      try {
        const workspace = await databaseService.createWorkspace(name, color);
        return { success: true, workspace };
      } catch (error) {
        log.error('Failed to create workspace:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'db:renameWorkspace',
    async (_, { id, name }: { id: string; name: string }) => {
      try {
        await databaseService.renameWorkspace(id, name);
        return { success: true };
      } catch (error) {
        log.error('Failed to rename workspace:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('db:deleteWorkspace', async (_, id: string) => {
    try {
      await databaseService.deleteWorkspace(id);
      return { success: true };
    } catch (error) {
      log.error('Failed to delete workspace:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('db:updateWorkspaceOrder', async (_, workspaceIds: string[]) => {
    try {
      await databaseService.updateWorkspaceOrder(workspaceIds);
      return { success: true };
    } catch (error) {
      log.error('Failed to update workspace order:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:updateWorkspaceColor',
    async (_, { id, color }: { id: string; color: string }) => {
      try {
        await databaseService.updateWorkspaceColor(id, color);
        return { success: true };
      } catch (error) {
        log.error('Failed to update workspace color:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'db:updateWorkspaceEmoji',
    async (_, { id, emoji }: { id: string; emoji: string | null }) => {
      try {
        await databaseService.updateWorkspaceEmoji(id, emoji);
        return { success: true };
      } catch (error) {
        log.error('Failed to update workspace emoji:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'db:setProjectWorkspace',
    async (_, { projectId, workspaceId }: { projectId: string; workspaceId: string | null }) => {
      try {
        await databaseService.setProjectWorkspace(projectId, workspaceId);
        return { success: true };
      } catch (error) {
        log.error('Failed to set project workspace:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Multi-chat support handlers
  ipcMain.handle(
    'db:createConversation',
    async (
      _,
      {
        taskId,
        title,
        provider,
        isMain,
      }: { taskId: string; title: string; provider?: string; isMain?: boolean }
    ) => {
      try {
        const conversation = await databaseService.createConversation(
          taskId,
          title,
          provider,
          isMain
        );
        return { success: true, conversation };
      } catch (error) {
        log.error('Failed to create conversation:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'db:setActiveConversation',
    async (_, { taskId, conversationId }: { taskId: string; conversationId: string }) => {
      try {
        await databaseService.setActiveConversation(taskId, conversationId);
        return { success: true };
      } catch (error) {
        log.error('Failed to set active conversation:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('db:getActiveConversation', async (_, taskId: string) => {
    try {
      const conversation = await databaseService.getActiveConversation(taskId);
      return { success: true, conversation };
    } catch (error) {
      log.error('Failed to get active conversation:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    'db:reorderConversations',
    async (_, { taskId, conversationIds }: { taskId: string; conversationIds: string[] }) => {
      try {
        await databaseService.reorderConversations(taskId, conversationIds);
        return { success: true };
      } catch (error) {
        log.error('Failed to reorder conversations:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'db:updateConversationTitle',
    async (_, { conversationId, title }: { conversationId: string; title: string }) => {
      try {
        await databaseService.updateConversationTitle(conversationId, title);
        return { success: true };
      } catch (error) {
        log.error('Failed to update conversation title:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );
}
