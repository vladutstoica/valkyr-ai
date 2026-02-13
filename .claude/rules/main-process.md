---
paths:
  - "src/main/**/*.ts"
---

# Main Process Rules

## Boot Sequence
The app boots: `entry.ts` → `main.ts` → IPC registration → window creation.

- `entry.ts` sets app name before `app.getPath('userData')` is called
- `entry.ts` monkey-patches `Module._resolveFilename` for path aliases at runtime
- `main.ts` loads `.env`, fixes PATH for CLI discovery, initializes windows

## Path Alias Resolution (Main)
| Alias | Resolves To |
|-------|-------------|
| `@/*` | `src/*` (NOT `src/renderer/`) |
| `@shared/*` | `src/shared/*` |

## Service Pattern
Services are singletons with module-level exports:
```typescript
export class MyService { /* ... */ }
export const myService = new MyService();
```

## IPC Handler Pattern
All handlers return `{ success: boolean, data?: any, error?: string }`:
```typescript
ipcMain.handle('namespace:action', async (_event, args) => {
  try {
    const result = await service.method(args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

## Logging
Use `log` from `../lib/logger`:
```typescript
import log from '../lib/logger';
log.error('Something failed', error);
log.info('Operation completed');
```

## PTY Management
- Always clean up PTYs on exit using `removePty()` in exit handlers
- Race conditions can kill agent runs if PTY cleanup is mishandled

## CLI Discovery
If agents can't find `gh`, `codex`, `claude`, etc., the PATH setup in `main.ts` may need platform-specific updates.
