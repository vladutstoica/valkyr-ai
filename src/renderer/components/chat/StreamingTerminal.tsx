import React, { useCallback } from 'react';
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalStatus,
  TerminalActions,
  TerminalCopyButton,
  TerminalStopButton,
  TerminalContent,
} from '../ai-elements/terminal';
import { useToolOutput } from '../../lib/toolOutputStore';

interface StreamingTerminalProps {
  toolCallId: string;
  command: string;
  finalOutput: string;
  isStreaming: boolean;
  sessionKey: string | null;
}

export function StreamingTerminal({
  toolCallId,
  command,
  finalOutput,
  isStreaming,
  sessionKey,
}: StreamingTerminalProps) {
  const streamingOutput = useToolOutput(toolCallId);
  const output = finalOutput || streamingOutput;

  const handleStop = useCallback(() => {
    if (sessionKey) {
      window.electronAPI.acpCancel({ sessionKey });
    }
  }, [sessionKey]);

  return (
    <Terminal output={output} isStreaming={isStreaming}>
      <TerminalHeader>
        <TerminalTitle>{command ? `$ ${command.slice(0, 80)}` : 'Terminal'}</TerminalTitle>
        <div className="flex items-center gap-1">
          <TerminalStatus />
          <TerminalActions>
            {sessionKey && <TerminalStopButton onStop={handleStop} />}
            <TerminalCopyButton />
          </TerminalActions>
        </div>
      </TerminalHeader>
      <TerminalContent />
    </Terminal>
  );
}
