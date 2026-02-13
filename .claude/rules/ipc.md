---
paths:
  - "src/main/ipc/**/*.ts"
  - "src/renderer/types/electron-api.d.ts"
---

# IPC Communication Rules

## Adding New IPC Methods

1. **Define the handler** in `src/main/ipc/<namespace>Ipc.ts`:
```typescript
ipcMain.handle('namespace:methodName', async (_event, args: { id: string }) => {
  try {
    const result = await service.doSomething(args.id);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

2. **Add types** in `src/renderer/types/electron-api.d.ts`:
```typescript
interface ElectronAPI {
  // ... existing methods
  namespaceMethodName: (args: { id: string }) => Promise<IpcResult<ReturnType>>;
}
```

3. **Expose in preload** (`src/main/preload.ts`):
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods
  namespaceMethodName: (args) => ipcRenderer.invoke('namespace:methodName', args),
});
```

## Response Format
ALL IPC handlers must return:
```typescript
interface IpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## IPC Namespaces
- `app:*` — App-level operations
- `db:*` — Database operations
- `git:*` — Git operations
- `github:*` — GitHub integration
- `pty:*` — Terminal/PTY operations
- `worktree:*` — Worktree management
- `settings:*` — App settings
- `project:*` — Project management

## Type Safety
- Define types in `electron-api.d.ts` BEFORE implementing
- Use specific types, not `any`
- Type imports: `import type { Foo } from './bar'`
