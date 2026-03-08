import React from 'react';
import { AlertCircle } from 'lucide-react';

function parseAcpError(raw: string): { statusCode: number | null; message: string } {
  const statusMatch = raw.match(/API Error:\s*(\d{3})/);
  const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;

  const jsonMatch = raw.match(/\{.*"message"\s*:\s*"([^"]+)".*\}/);
  const message = jsonMatch ? jsonMatch[1] : raw;

  return { statusCode, message };
}

export function AcpErrorCard({ error }: { error: string }) {
  const { statusCode, message } = parseAcpError(error);
  const [showRaw, setShowRaw] = React.useState(false);

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-red-300">
              {statusCode ? `Server Error (${statusCode})` : 'Error'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-red-300/80">{message}</p>
          {error !== message && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="mt-1.5 text-[11px] text-red-400/60 transition-colors hover:text-red-400/90"
            >
              {showRaw ? 'Hide details' : 'Show details'}
            </button>
          )}
          {showRaw && (
            <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-red-500/5 p-2 font-mono text-[11px] whitespace-pre-wrap text-red-300/60">
              {error}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
