/**
 * Service abstraction for conversation-related IPC calls.
 */

import type { Conversation, Message } from '../../main/services/DatabaseService';

// Re-derive result types from the IPC API
export type GetConversationsResult = Awaited<
  ReturnType<typeof window.electronAPI.getConversations>
>;
export type SaveConversationResult = Awaited<
  ReturnType<typeof window.electronAPI.saveConversation>
>;
export type DeleteConversationResult = Awaited<
  ReturnType<typeof window.electronAPI.deleteConversation>
>;
export type GetMessagesResult = Awaited<ReturnType<typeof window.electronAPI.getMessages>>;
export type SaveMessageResult = Awaited<ReturnType<typeof window.electronAPI.saveMessage>>;

export function getConversations(taskId: string): Promise<GetConversationsResult> {
  return window.electronAPI.getConversations(taskId);
}

export function saveConversation(
  conversation: Omit<Conversation, 'createdAt' | 'updatedAt'> &
    Partial<Pick<Conversation, 'createdAt' | 'updatedAt'>>
): Promise<SaveConversationResult> {
  return window.electronAPI.saveConversation(conversation);
}

export function deleteConversation(conversationId: string): Promise<DeleteConversationResult> {
  return window.electronAPI.deleteConversation(conversationId);
}

export function getMessages(conversationId: string): Promise<GetMessagesResult> {
  return window.electronAPI.getMessages(conversationId);
}

export function saveMessage(
  message: Omit<Message, 'timestamp'> & Partial<Pick<Message, 'timestamp'>>
): Promise<SaveMessageResult> {
  return window.electronAPI.saveMessage(message);
}

export function getOrCreateDefaultConversation(taskId: string) {
  return window.electronAPI.getOrCreateDefaultConversation(taskId);
}

export function createConversation(params: {
  taskId: string;
  title: string;
  provider?: string;
  isMain?: boolean;
  mode?: 'pty' | 'acp';
}) {
  return window.electronAPI.createConversation(params);
}

export function setActiveConversation(params: { taskId: string; conversationId: string }) {
  return window.electronAPI.setActiveConversation(params);
}

export function getActiveConversation(taskId: string) {
  return window.electronAPI.getActiveConversation(taskId);
}

export function updateConversationTitle(params: { conversationId: string; title: string }) {
  return window.electronAPI.updateConversationTitle(params);
}

export function updateConversationAcpSessionId(params: {
  conversationId: string;
  acpSessionId: string;
}) {
  return window.electronAPI.updateConversationAcpSessionId(params);
}

export function reorderConversations(params: { taskId: string; conversationIds: string[] }) {
  return window.electronAPI.reorderConversations(params);
}

export function cleanupSessionDirectory(params: { taskPath: string; conversationId: string }) {
  return window.electronAPI.cleanupSessionDirectory(params);
}
