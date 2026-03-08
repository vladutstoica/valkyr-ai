import React, { useCallback, useEffect, useState } from 'react';
import { HistoryIcon, Loader2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

type AcpSessionInfo = {
  sessionId: string;
  title?: string | null;
  updatedAt?: string | null;
  cwd: string;
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface SessionHistoryPopoverProps {
  sessionKey: string | null;
  currentAcpSessionId: string | null;
  cwd: string;
  projectPath?: string;
  onResumeSession: (acpSessionId: string, title?: string) => void;
}

export function SessionHistoryPopover({
  sessionKey,
  currentAcpSessionId,
  cwd,
  projectPath,
  onResumeSession,
}: SessionHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<AcpSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!sessionKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.acpListSessions({ sessionKey });
      if (result.success && result.sessions) {
        const filtered = (result.sessions as AcpSessionInfo[])
          .filter((s) => s.sessionId !== currentAcpSessionId && s.cwd === (projectPath || cwd))
          .sort((a, b) => {
            if (!a.updatedAt || !b.updatedAt) return 0;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
        setSessions(filtered);
      } else {
        setError(result.error || 'Failed to load sessions');
      }
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : String(err)) || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [sessionKey, currentAcpSessionId, cwd, projectPath]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          title="Session History"
        >
          <HistoryIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-border/50 border-b px-3 py-2">
          <p className="text-muted-foreground text-xs font-medium">Session History</p>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">{error}</div>
          )}
          {!loading && !error && sessions.length === 0 && (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">
              No previous sessions found
            </div>
          )}
          {!loading &&
            !error &&
            sessions.map((s) => (
              <button
                key={s.sessionId}
                type="button"
                className="hover:bg-accent flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors"
                onClick={() => {
                  onResumeSession(s.sessionId, s.title ?? undefined);
                  setOpen(false);
                }}
              >
                <span className="truncate text-xs font-medium">
                  {s.title || s.sessionId.slice(0, 12) + '...'}
                </span>
                {s.updatedAt && (
                  <span className="text-muted-foreground text-[10px]">
                    {formatRelativeTime(s.updatedAt)}
                  </span>
                )}
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
