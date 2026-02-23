import React from 'react';
import { motion } from 'motion/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { ExternalLink, Users, Tag } from 'lucide-react';
import githubLogo from '../../assets/images/github.png';
import type { GitHubIssueSummary } from '../types/github';

type Props = {
  issue: GitHubIssueSummary | null;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

const StatusPill = ({ state }: { state?: string | null }) => {
  if (!state) return null;

  const getStatusColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'closed':
        return 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200';
      case 'open':
        return 'bg-blue-100/70 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200';
      default:
        return 'bg-slate-100/70 text-slate-800 dark:bg-slate-500/10 dark:text-slate-200';
    }
  };

  return (
    <span
      className={`border-border inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-[11px] ${getStatusColor(state)}`}
    >
      {state}
    </span>
  );
};

export const GitHubIssuePreviewTooltip: React.FC<Props> = ({ issue, children, side = 'top' }) => {
  if (!issue) return children;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          align="start"
          className="border-0 bg-transparent p-0 shadow-none"
          style={{ zIndex: 10000 }}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="border-border/70 bg-popover/95 max-w-sm min-w-[260px] rounded-none border p-3 shadow-xl backdrop-blur-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <img src={githubLogo} alt="GitHub" className="h-4 w-4" />
                <span className="tracking-wide">GitHub Issue</span>
                <span className="text-muted-foreground/80 font-semibold">#{issue.number}</span>
              </div>
              {issue.url && (
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.electronAPI?.openExternal && issue.url) {
                      e.preventDefault();
                      window.electronAPI.openExternal(issue.url);
                    }
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="text-foreground mt-1 line-clamp-2 text-sm font-semibold">
              {issue.title || `Issue #${issue.number}`}
            </div>

            {issue.body && (
              <div className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">{issue.body}</div>
            )}

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
              <StatusPill state={issue.state} />

              {issue.assignees && issue.assignees.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>
                    {issue.assignees
                      .map((a) => a.login || a.name)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ')}
                    {issue.assignees.length > 2 && ` +${issue.assignees.length - 2}`}
                  </span>
                </span>
              )}

              {issue.labels && issue.labels.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  <span>
                    {issue.labels
                      .map((l) => l.name)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ')}
                    {issue.labels.length > 2 && ` +${issue.labels.length - 2}`}
                  </span>
                </span>
              )}
            </div>
          </motion.div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GitHubIssuePreviewTooltip;
