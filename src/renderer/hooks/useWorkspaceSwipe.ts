import { useEffect, useRef } from 'react';

interface Workspace {
  id: string;
  displayOrder: number;
}

/**
 * Two-finger horizontal swipe to switch between workspaces.
 * Attach the returned ref to the sidebar container element.
 */
export function useWorkspaceSwipe(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  onSwitchWorkspace: ((id: string) => void) | undefined
) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const swipeDeltaRef = useRef(0);
  const swipeCooldownRef = useRef(false);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el || !onSwitchWorkspace || workspaces.length < 2) return;

    const sortedWorkspaces = [...workspaces].sort((a, b) => a.displayOrder - b.displayOrder);

    const handleWheel = (e: WheelEvent) => {
      // Only handle horizontal-dominant gestures
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

      e.preventDefault();

      // During cooldown, absorb all events and discard delta
      if (swipeCooldownRef.current) {
        swipeDeltaRef.current = 0;
        return;
      }

      swipeDeltaRef.current += e.deltaX;

      const threshold = 50;
      if (Math.abs(swipeDeltaRef.current) < threshold) return;

      const currentIndex = sortedWorkspaces.findIndex((ws) => ws.id === activeWorkspaceId);
      if (currentIndex === -1) {
        swipeDeltaRef.current = 0;
        return;
      }

      let nextIndex: number;
      if (swipeDeltaRef.current > 0) {
        // Swipe left → next workspace
        nextIndex = currentIndex + 1;
      } else {
        // Swipe right → previous workspace
        nextIndex = currentIndex - 1;
      }

      swipeDeltaRef.current = 0;

      if (nextIndex < 0 || nextIndex >= sortedWorkspaces.length) return;

      swipeCooldownRef.current = true;
      onSwitchWorkspace(sortedWorkspaces[nextIndex].id);
      setTimeout(() => {
        swipeDeltaRef.current = 0;
        swipeCooldownRef.current = false;
      }, 1000);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [workspaces, activeWorkspaceId, onSwitchWorkspace]);

  return sidebarRef;
}
