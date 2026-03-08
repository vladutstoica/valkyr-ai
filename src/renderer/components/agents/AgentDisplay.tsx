import React from 'react';
import { MessageSquare } from 'lucide-react';
import { type Agent } from '../../types';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { CommentsPopover } from '../CommentsPopover';
import { Button } from '../ui/button';
import { useTaskComments } from '../../hooks/useLineComments';
import { useTaskScope } from '../project/TaskScopeContext';

// Agent logos
import openaiLogo from '../../../assets/images/openai.png';
import kiroLogo from '../../../assets/images/kiro.png';
import claudeLogo from '../../../assets/images/claude.png';
import factoryLogo from '../../../assets/images/factorydroid.png';
import geminiLogo from '../../../assets/images/gemini.png';
import cursorLogo from '../../../assets/images/cursorlogo.png';
import copilotLogo from '../../../assets/images/ghcopilot.png';
import ampLogo from '../../../assets/images/ampcode.png';
import opencodeLogo from '../../../assets/images/opencode.png';
import charmLogo from '../../../assets/images/charm.png';
import qwenLogo from '../../../assets/images/qwen.png';
import augmentLogo from '../../../assets/images/augmentcode.png';
import gooseLogo from '../../../assets/images/goose.png';
import kimiLogo from '../../../assets/images/kimi.png';
import kilocodeLogo from '../../../assets/images/kilocode.png';
import atlassianLogo from '../../../assets/images/atlassian.png';
import clineLogo from '../../../assets/images/cline.png';
import continueLogo from '../../../assets/images/continue.png';
import codebuffLogo from '../../../assets/images/codebuff.png';
import mistralLogo from '../../../assets/images/mistral.png';

type Props = {
  agent: Agent;
  taskId?: string;
};

const agentConfig: Record<Agent, { name: string; logo: string }> = {
  qwen: { name: 'Qwen Code', logo: qwenLogo },
  codex: { name: 'Codex', logo: openaiLogo },
  claude: { name: 'Claude Code', logo: claudeLogo },
  droid: { name: 'Droid', logo: factoryLogo },
  gemini: { name: 'Gemini', logo: geminiLogo },
  cursor: { name: 'Cursor', logo: cursorLogo },
  copilot: { name: 'Copilot', logo: copilotLogo },
  amp: { name: 'Amp', logo: ampLogo },
  opencode: { name: 'OpenCode', logo: opencodeLogo },
  charm: { name: 'Charm', logo: charmLogo },
  auggie: { name: 'Auggie', logo: augmentLogo },
  goose: { name: 'Goose', logo: gooseLogo },
  kimi: { name: 'Kimi', logo: kimiLogo },
  kilocode: { name: 'Kilocode', logo: kilocodeLogo },
  kiro: { name: 'Kiro', logo: kiroLogo },
  rovo: { name: 'Rovo Dev', logo: atlassianLogo },
  cline: { name: 'Cline', logo: clineLogo },
  continue: { name: 'Continue', logo: continueLogo },
  codebuff: { name: 'Codebuff', logo: codebuffLogo },
  mistral: { name: 'Mistral Vibe', logo: mistralLogo },
};

export const AgentDisplay: React.FC<Props> = ({
  agent,
  taskId,
}) => {
  const config = agentConfig[agent] ?? { name: agent, logo: '' };
  const { taskId: scopedTaskId } = useTaskScope();
  const resolvedTaskId = taskId ?? scopedTaskId;
  const { unsentCount } = useTaskComments(resolvedTaskId);
  const [selectedCount, setSelectedCount] = React.useState(0);

  React.useEffect(() => {
    setSelectedCount(0);
  }, [resolvedTaskId]);

  return (
    <div className="inline-flex items-center gap-2">
      {/* Agent Badge */}
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="border-border bg-muted text-foreground dark:border-border dark:bg-muted inline-flex h-7 cursor-default items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium select-none"
              role="status"
              aria-label={`Current agent: ${config.name}`}
            >
              {config.logo ? (
                <img
                  src={config.logo}
                  alt={config.name}
                  className={`h-3.5 w-3.5 flex-shrink-0 rounded-xs object-contain ${
                    agent === 'codex' || agent === 'auggie' ? 'dark-black:invert dark:invert' : ''
                  }`}
                />
              ) : (
                <div
                  className="bg-muted-foreground/20 text-micro text-foreground flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] font-semibold"
                  aria-hidden
                >
                  {config.name.slice(0, 1)}
                </div>
              )}
              <span className="max-w-[10rem] truncate">{config.name}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Agent locked for this conversation</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {resolvedTaskId && unsentCount > 0 && (
        <CommentsPopover
          tooltipContent="Selected comments are appended to your next agent message."
          tooltipDelay={300}
          onSelectedCountChange={setSelectedCount}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={[
              'relative h-7 gap-1.5 px-2 text-xs',
              selectedCount > 0
                ? 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/15'
                : 'border-border bg-muted hover:bg-muted/80 dark:border-border dark:bg-muted',
            ].join(' ')}
            title={
              selectedCount > 0
                ? `${selectedCount} selected comment${selectedCount === 1 ? '' : 's'} ready to append`
                : 'Review or select comments to append'
            }
          >
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-medium">Comments</span>
            {selectedCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
                {selectedCount}
              </span>
            )}
          </Button>
        </CommentsPopover>
      )}
    </div>
  );
};

export default AgentDisplay;
