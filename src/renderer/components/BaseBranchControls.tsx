import React from 'react';
import BranchSelect, { type BranchOption } from './BranchSelect';

interface BaseBranchControlsProps {
  baseBranch?: string;
  branchOptions: BranchOption[];
  isLoadingBranches: boolean;
  isSavingBaseBranch: boolean;
  onBaseBranchChange: (value: string) => void;
  projectPath?: string;
  onEditConfig?: () => void;
  onPreloadConfig?: () => void;
}

const BaseBranchControls: React.FC<BaseBranchControlsProps> = ({
  baseBranch,
  branchOptions,
  isLoadingBranches,
  isSavingBaseBranch,
  onBaseBranchChange,
  projectPath,
  onEditConfig,
  onPreloadConfig,
}) => {
  const placeholder = isLoadingBranches
    ? 'Loading...'
    : branchOptions.length === 0
      ? 'No branches found'
      : 'Select a base branch';

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-foreground text-xs font-medium">Base branch</p>
        <BranchSelect
          value={baseBranch}
          onValueChange={onBaseBranchChange}
          options={branchOptions}
          disabled={isSavingBaseBranch}
          isLoading={isLoadingBranches}
          placeholder={placeholder}
          variant="default"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        New sessions start from the latest code.
        {projectPath && onEditConfig && (
          <>
            {' · '}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline"
              onClick={onEditConfig}
              onMouseEnter={onPreloadConfig}
              onFocus={onPreloadConfig}
            >
              Edit config
            </button>
          </>
        )}
      </p>
    </div>
  );
};

export default BaseBranchControls;
