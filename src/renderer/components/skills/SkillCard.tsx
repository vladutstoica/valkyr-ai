import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil } from 'lucide-react';
import type { CatalogSkill } from '@shared/skills/types';
import { useIsMonochrome } from '../../hooks/useIsMonochrome';

interface SkillCardProps {
  skill: CatalogSkill;
  onSelect: (skill: CatalogSkill) => void;
  onInstall: (skillId: string) => void;
}

const SkillIcon: React.FC<{ skill: CatalogSkill }> = ({ skill }) => {
  const [imgError, setImgError] = useState(false);
  const letter = skill.displayName.charAt(0).toUpperCase();
  const isMonochrome = useIsMonochrome(skill.iconUrl);

  if (skill.iconUrl && !imgError) {
    return (
      <div className="bg-muted/40 flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl">
        <img
          src={skill.iconUrl}
          alt=""
          className={`h-10 w-10 rounded-lg object-contain ${isMonochrome !== false ? 'dark:invert' : ''}`.trim()}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="bg-muted/40 text-foreground/60 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-base font-semibold dark:text-white">
      {letter}
    </div>
  );
};

const SkillCard: React.FC<SkillCardProps> = ({ skill, onSelect, onInstall }) => {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1, ease: 'easeInOut' }}
      onClick={() => onSelect(skill)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(skill);
        }
      }}
      className="group border-border bg-muted/20 text-card-foreground hover:bg-muted/40 flex w-full cursor-pointer items-center gap-3 rounded-lg border p-4 text-left shadow-xs transition-all hover:shadow-md"
    >
      <SkillIcon skill={skill} />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{skill.displayName}</h3>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{skill.description}</p>
      </div>

      {/* Action */}
      <div className="flex-shrink-0 self-center">
        {skill.installed ? (
          <Pencil className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInstall(skill.id);
            }}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1 transition-colors"
            aria-label={`Install ${skill.displayName}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default SkillCard;
