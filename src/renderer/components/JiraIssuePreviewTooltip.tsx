import React from 'react';
import { motion } from 'motion/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { ExternalLink, User, Folder } from 'lucide-react';
import jiraLogo from '../../assets/images/jira.png';
import type { JiraIssueSummary } from '../types/jira';

type Props = {
  issue: JiraIssueSummary | null;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

const StatusPill = ({ status }: { status?: { name?: string | null } | null }) => {
  if (!status?.name) return null;

  const getStatusColor = (name: string) => {
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes('done') ||
      lowerName.includes('closed') ||
      lowerName.includes('resolved')
    ) {
      return 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200';
    }
    if (lowerName.includes('progress') || lowerName.includes('review')) {
      return 'bg-blue-100/70 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200';
    }
    if (lowerName.includes('blocked') || lowerName.includes('cancelled')) {
      return 'bg-rose-100/70 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200';
    }
    return 'bg-slate-100/70 text-slate-800 dark:bg-slate-500/10 dark:text-slate-200';
  };

  return (
    <span
      className={`border-border inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-[11px] ${getStatusColor(status.name)}`}
    >
      {status.name}
    </span>
  );
};

export const JiraIssuePreviewTooltip: React.FC<Props> = ({ issue, children, side = 'top' }) => {
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
                <img src={jiraLogo} alt="Jira" className="h-4 w-4" />
                <span className="tracking-wide">Jira Issue</span>
                <span className="text-muted-foreground/80 font-semibold">{issue.key}</span>
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
              {issue.summary || `Issue ${issue.key}`}
            </div>

            {issue.description && (
              <div className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">
                {issue.description}
              </div>
            )}

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={issue.status} />

              {issue.assignee?.displayName && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{issue.assignee.displayName}</span>
                </span>
              )}

              {issue.project?.name && (
                <span className="inline-flex items-center gap-1">
                  <Folder className="h-3 w-3" />
                  <span>{issue.project.name}</span>
                </span>
              )}
            </div>
          </motion.div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default JiraIssuePreviewTooltip;
