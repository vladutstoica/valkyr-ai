import React, { useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { PopoverContent } from '../ui/popover';
import { SessionHistoryPopover } from './SessionHistoryPopover';
import { Command } from '../ui/command';
import { ModelInfoCard } from '../agents/ModelInfoCard';
import {
  PlanUsageHoverCard,
  useClaudeUsageLimits,
} from '../ai-elements/plan-usage';
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorName,
} from '../ai-elements/model-selector';
import {
  messagesToMarkdown,
  type ConversationMessage,
} from '../ai-elements/conversation';
import { agentConfig } from '../../lib/agentConfig';
import { getTextFromParts } from './acpChatUtils';
import type { UIMessage } from 'ai';
import type { Agent } from '../../types';
import type { AcpSessionModels, AcpSessionModel } from '../../types/electron-api';

interface AcpChatToolbarProps {
  providerId: string;
  initialModels: AcpSessionModels | null;
  currentModelId: string;
  onModelChange: (modelId: string) => void;
  sessionKey: string | null;
  acpSessionId: string | null;
  cwd: string;
  projectPath?: string;
  messages: UIMessage[];
  onCreateNewChat?: () => void;
  onResumeSession?: (acpSessionId: string, title?: string) => void;
  onClearChat?: () => void;
  onDeleteChat?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

export function AcpChatToolbar({
  providerId,
  initialModels,
  currentModelId,
  onModelChange,
  sessionKey,
  acpSessionId,
  cwd,
  projectPath,
  messages,
  onCreateNewChat,
  onResumeSession,
  onClearChat,
  onDeleteChat,
  onMoveLeft,
  onMoveRight,
  canMoveLeft = true,
  canMoveRight = true,
}: AcpChatToolbarProps) {
  const [hoveredModel, setHoveredModel] = useState<AcpSessionModel | null>(null);
  const agent = agentConfig[providerId as Agent];
  const claudeUsageLimits = useClaudeUsageLimits(providerId);
  const currentModel = initialModels?.availableModels.find((m) => m.id === currentModelId);

  return (
    <div className="border-border/50 flex shrink-0 items-center justify-between border-b p-3">
      {/* Left: model name */}
      <div className="flex items-center">
        {agent && initialModels && initialModels.availableModels.length > 1 && currentModelId ? (
          <ModelSelector
            onOpenChange={(open) => {
              if (!open) setHoveredModel(null);
            }}
          >
            <ModelSelectorTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors"
              >
                <img
                  src={agent.logo}
                  alt={agent.alt}
                  className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
                />
                <span>{currentModel?.name ?? agent.name}</span>
                <ChevronDownIcon className="size-3 opacity-50" />
              </button>
            </ModelSelectorTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex">
                <Command className="w-64 **:data-[slot=command-input-wrapper]:h-auto">
                  <ModelSelectorInput placeholder="Search models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    <ModelSelectorGroup heading={agent.name}>
                      {initialModels.availableModels.map((model) => (
                        <ModelSelectorItem
                          key={model.id}
                          value={model.id}
                          onSelect={() => onModelChange(model.id)}
                          className="flex items-center gap-2"
                          onMouseEnter={() => setHoveredModel(model)}
                          onMouseLeave={() => setHoveredModel(null)}
                        >
                          <img
                            src={agent.logo}
                            alt={agent.alt}
                            className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
                          />
                          <ModelSelectorName>{model.name}</ModelSelectorName>
                          {model.id === currentModelId && (
                            <CheckIcon className="ml-auto size-3.5 shrink-0" />
                          )}
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  </ModelSelectorList>
                </Command>
                {hoveredModel && (
                  <ModelInfoCard
                    modelId={hoveredModel.id}
                    providerId={providerId}
                    providerName={agent.name}
                    modelName={hoveredModel.name}
                    modelDescription={hoveredModel.description}
                    providerIcon={agent.logo}
                    invertIconInDark={agent.invertInDark}
                  />
                )}
              </div>
            </PopoverContent>
          </ModelSelector>
        ) : agent ? (
          <div className="text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 px-1 text-xs">
            <img
              src={agent.logo}
              alt={agent.alt}
              className={`size-3.5 rounded-sm ${agent.invertInDark ? 'dark:invert' : ''}`}
            />
            <span>{agent.name}</span>
          </div>
        ) : null}
      </div>

      {/* Right: plan usage + action buttons */}
      <div className="flex items-center gap-0.5">
        {claudeUsageLimits && (
          <PlanUsageHoverCard limits={claudeUsageLimits} side="bottom" align="end" />
        )}
        <button
          type="button"
          onClick={onCreateNewChat}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          title="New Chat"
        >
          <PlusIcon className="size-3.5" />
        </button>
        {onResumeSession && sessionKey && (
          <SessionHistoryPopover
            sessionKey={sessionKey}
            currentAcpSessionId={acpSessionId}
            cwd={cwd}
            projectPath={projectPath}
            onResumeSession={onResumeSession}
          />
        )}
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          title="Settings"
        >
          <SettingsIcon className="size-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              title="More"
            >
              <MoreHorizontalIcon className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onClearChat}>
              <RefreshCwIcon className="size-4" />
              Clear Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveRight} disabled={!canMoveRight}>
              <ArrowRightIcon className="size-4" />
              Move Right
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveLeft} disabled={!canMoveLeft}>
              <ArrowLeftIcon className="size-4" />
              Move Left
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={messages.length === 0}
              onClick={async () => {
                const conversationMessages: ConversationMessage[] = messages.map((m) => ({
                  role: m.role,
                  content: getTextFromParts(m.parts),
                }));
                const markdown = messagesToMarkdown(conversationMessages);
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const handle = await (window as any).showSaveFilePicker({
                    suggestedName: `conversation-${Date.now()}.md`,
                    types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
                  });
                  const writable = await handle.createWritable();
                  await writable.write(markdown);
                  await writable.close();
                } catch {
                  // User cancelled the dialog
                }
              }}
            >
              <DownloadIcon className="size-4" />
              Download Chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDeleteChat} className="text-red-400 focus:text-red-400">
              <Trash2Icon className="size-4" />
              Delete Chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
