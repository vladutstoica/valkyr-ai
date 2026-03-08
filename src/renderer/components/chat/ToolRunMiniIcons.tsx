import React from 'react';
import { getToolIconComponent } from '../../lib/toolRenderer';
import { getAcpMeta } from '../../lib/acpChatTransport';

/** Render a row of mini tool-type icons for a tool run group header. */
export function ToolRunMiniIcons({ toolRun }: { toolRun: Array<{ part: any }> }) {
  return (
    <span className="flex items-center gap-0.5">
      {toolRun.map((t, idx) => {
        const tKind = getAcpMeta(t.part)?.kind;
        const Icon = getToolIconComponent(
          t.part.toolName || t.part.type?.replace(/^tool-/, '') || '',
          tKind
        );
        return <Icon key={idx} className="text-muted-foreground/40 size-2.5" />;
      })}
    </span>
  );
}
