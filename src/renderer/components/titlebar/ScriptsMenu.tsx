import React from 'react';
import { emitScriptRun } from '../../lib/scriptRunStore';
import { Play } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface ScriptsMenuProps {
  path: string;
}

const ScriptsMenu: React.FC<ScriptsMenuProps> = ({ path }) => {
  const [scripts, setScripts] = React.useState<{ name: string; command: string }[]>([]);

  React.useEffect(() => {
    if (!path) return;
    window.electronAPI
      ?.getScripts?.(path)
      .then((result) => {
        if (result?.success && result.data) {
          setScripts(result.data);
        }
      })
      .catch(() => {});
  }, [path]);

  const handleRunScript = (scriptName: string) => {
    emitScriptRun({ scriptName, path });
  };

  if (scripts.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=open]:bg-background/80 data-[state=open]:text-foreground h-7 gap-1.5 px-2 text-[13px] leading-none font-medium"
        >
          <span>Scripts</span>
          <Play className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-[180px] overflow-y-auto">
        {scripts.map((script) => (
          <DropdownMenuItem
            key={script.name}
            onClick={() => handleRunScript(script.name)}
            className="gap-2"
          >
            <Play className="h-3 w-3 shrink-0" />
            <span className="font-mono text-xs">{script.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ScriptsMenu;
