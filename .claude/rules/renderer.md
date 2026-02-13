---
paths:
  - "src/renderer/**/*.ts"
  - "src/renderer/**/*.tsx"
---

# Renderer Process Rules

## Path Alias Resolution (Renderer)
| Alias | Resolves To |
|-------|-------------|
| `@/*` | `src/renderer/*` |
| `@shared/*` | `src/shared/*` |
| `#types/*` | `src/types/*` |
| `#types` | `src/types/index.ts` |

## React Patterns
- **Functional components only** with hooks
- **Named exports preferred** over default exports
- Clean up subscriptions in `useEffect` return:
```typescript
useEffect(() => {
  const unsubscribe = subscribe();
  return () => unsubscribe();
}, []);
```

## Component Organization
- Components: `PascalCase.tsx` (e.g., `FileExplorer.tsx`)
- Hooks: `use-kebab-case.ts` or `useCamelCase.ts`
- UI primitives: `src/renderer/ui/` (Radix-based)

## Error Handling
Use `console.error()` or toast notifications:
```typescript
import { toast } from '@/hooks/use-toast';
toast({ title: 'Error', description: message, variant: 'destructive' });
```

## Calling IPC
Always use `window.electronAPI`:
```typescript
const result = await window.electronAPI.someAction({ id: '123' });
if (!result.success) {
  console.error(result.error);
}
```

## Monaco Editor
- Editor instances MUST be disposed to prevent memory leaks
- Handle disposal in cleanup functions

## Styling
- Use Tailwind CSS classes exclusively
- Component library: Radix UI primitives
- Icons: lucide-react
