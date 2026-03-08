import React, { useEffect } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';
import { ChevronUpIcon } from 'lucide-react';

/** Exposes scrollToBottom from StickToBottom context via ref. */
export function ScrollBridge({
  scrollRef,
}: {
  scrollRef: React.MutableRefObject<(() => void) | null>;
}) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    scrollRef.current = scrollToBottom;
  }, [scrollRef, scrollToBottom]);
  return null;
}

/** Navigate to previous user message when not at bottom. */
export function UserMessageNavButton({
  onNavigate,
  onResetNav,
}: {
  onNavigate: () => void;
  onResetNav: () => void;
}) {
  const { isAtBottom } = useStickToBottomContext();

  // Reset navigation index whenever the user returns to the bottom
  useEffect(() => {
    if (isAtBottom) onResetNav();
  }, [isAtBottom, onResetNav]);

  if (isAtBottom) return null;
  return (
    <button
      type="button"
      className="bg-background/80 border-border/50 text-muted-foreground hover:text-foreground hover:bg-background pointer-events-auto absolute right-4 bottom-14 z-10 inline-flex size-7 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors"
      onClick={onNavigate}
      title="Previous message you sent"
    >
      <ChevronUpIcon className="size-3.5" />
    </button>
  );
}
