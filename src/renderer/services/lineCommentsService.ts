// Thin service layer over line-comments IPC calls.

export function getLineComments(args: { taskId: string }) {
  return window.electronAPI.lineCommentsGet(args);
}

export function createLineComment(args: {
  taskId: string;
  filePath: string;
  lineNumber: number;
  lineContent?: string;
  content: string;
}) {
  return window.electronAPI.lineCommentsCreate(args);
}

export function updateLineComment(args: { id: string; content: string }) {
  return window.electronAPI.lineCommentsUpdate(args);
}

export function deleteLineComment(id: string) {
  return window.electronAPI.lineCommentsDelete(id);
}

export function markLineCommentsSent(commentIds: string[]) {
  return window.electronAPI.lineCommentsMarkSent(commentIds);
}
