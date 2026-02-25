import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { AlertTriangle, CheckCircle2, Terminal } from 'lucide-react';

interface PrerequisiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  gitMissing: boolean;
  detectedAgents: string[];
}

export function PrerequisiteModal({
  isOpen,
  onClose,
  gitMissing,
  detectedAgents,
}: PrerequisiteModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Missing Prerequisites
          </DialogTitle>
          <DialogDescription>Some required tools were not found on your system.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {gitMissing && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
              <div className="mb-1 flex items-center gap-2 font-medium text-red-400">
                <Terminal className="h-4 w-4" />
                Git is not installed
              </div>
              <p className="text-muted-foreground text-sm">
                Git is required for Valkyr to manage worktrees and track changes. Install it from{' '}
                <a
                  href="https://git-scm.com/downloads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline"
                >
                  git-scm.com
                </a>{' '}
                or via your package manager:
              </p>
              <pre className="text-muted-foreground mt-2 rounded bg-black/30 px-2 py-1 text-xs">
                {`# macOS\nbrew install git\n\n# Ubuntu/Debian\nsudo apt install git\n\n# Windows\nwinget install Git.Git`}
              </pre>
            </div>
          )}

          {detectedAgents.length > 0 && (
            <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Detected agents
              </div>
              <p className="text-muted-foreground text-sm">{detectedAgents.join(', ')}</p>
            </div>
          )}

          {detectedAgents.length === 0 && !gitMissing && (
            <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
              <p className="text-muted-foreground text-sm">
                No coding agents were detected. Install at least one (e.g. Claude Code, Codex, Amp)
                to start using Valkyr.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
          >
            {gitMissing ? 'I understand' : 'Continue'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
