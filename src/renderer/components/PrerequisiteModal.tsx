import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { AlertTriangle, CheckCircle2, Terminal, Sparkles } from 'lucide-react';

interface PrerequisiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  gitMissing: boolean;
  detectedAgents: string[];
}

const AGENT_INSTALL_COMMANDS = [
  { name: 'Claude Code', command: 'curl -fsSL https://claude.ai/install.sh | bash', badge: 'ACP' },
  { name: 'Codex', command: 'npm install -g @openai/codex', badge: 'ACP' },
  { name: 'Gemini CLI', command: 'npm install -g @anthropic-ai/gemini', badge: 'ACP' },
  { name: 'Amp', command: 'npm install -g @anthropic-ai/amp' },
];

export function PrerequisiteModal({
  isOpen,
  onClose,
  gitMissing,
  detectedAgents,
}: PrerequisiteModalProps) {
  const noAgents = detectedAgents.length === 0 && !gitMissing;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {gitMissing ? (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Missing Prerequisites
              </>
            ) : noAgents ? (
              <>
                <Sparkles className="h-5 w-5 text-amber-400" />
                Install an Agent
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Ready to Go
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {gitMissing
              ? 'Some required tools were not found on your system.'
              : noAgents
                ? 'Install at least one coding agent to get started.'
                : 'Your system is set up and ready.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {gitMissing && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
              <div className="mb-1 flex items-center gap-2 font-medium text-red-400">
                <Terminal className="h-4 w-4" />
                Git is not installed
              </div>
              <p className="text-muted-foreground text-sm">
                Git is required for worktree isolation. Install via your package manager:
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

          {noAgents && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Agents marked <span className="text-amber-400 font-medium">ACP</span> support
                structured communication with richer status tracking and chat UI. Others run in
                terminal mode.
              </p>
              <div className="space-y-1.5">
                {AGENT_INSTALL_COMMANDS.map((agent) => (
                  <div
                    key={agent.name}
                    className="border-border/40 rounded-md border p-2.5"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-foreground text-sm font-medium">{agent.name}</span>
                      {agent.badge && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          {agent.badge}
                        </span>
                      )}
                    </div>
                    <code className="text-muted-foreground block text-xs select-all">
                      {agent.command}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
          >
            {gitMissing ? 'I understand' : noAgents ? 'I\u2019ll install later' : 'Continue'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
