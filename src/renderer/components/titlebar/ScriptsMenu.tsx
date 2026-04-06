import React, { useState, useEffect, useCallback } from 'react';
import { emitScriptRun } from '../../lib/scriptRunStore';
import { Play, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

type ScriptEntry = {
  name: string;
  command: string;
  source: 'package' | 'custom';
  cwd?: string;
};

interface ScriptsMenuProps {
  path: string;
}

const ScriptsMenu: React.FC<ScriptsMenuProps> = ({ path }) => {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<ScriptEntry | null>(null);
  const [formName, setFormName] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formCwd, setFormCwd] = useState('');

  const loadScripts = useCallback(() => {
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

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const handleRunScript = (script: ScriptEntry) => {
    if (script.source === 'custom') {
      emitScriptRun({ scriptName: script.name, path, command: script.command, cwd: script.cwd });
    } else {
      emitScriptRun({ scriptName: script.name, path });
    }
  };

  const openAddDialog = () => {
    setEditingScript(null);
    setFormName('');
    setFormCommand('');
    setFormCwd('');
    setDialogOpen(true);
  };

  const openEditDialog = (script: ScriptEntry) => {
    setEditingScript(script);
    setFormName(script.name);
    setFormCommand(script.command);
    setFormCwd(script.cwd || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    const command = formCommand.trim();
    if (!name || !command) return;

    const result = await window.electronAPI?.saveCustomScript?.(path, {
      name,
      command,
      ...(formCwd.trim() ? { cwd: formCwd.trim() } : {}),
    });

    if (result?.success) {
      setDialogOpen(false);
      loadScripts();
    }
  };

  const handleDelete = async (scriptName: string) => {
    const result = await window.electronAPI?.deleteCustomScript?.(path, scriptName);
    if (result?.success) {
      loadScripts();
    }
  };

  const customScripts = scripts.filter((s) => s.source === 'custom');
  const packageScripts = scripts.filter((s) => s.source === 'package');

  return (
    <>
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
        <DropdownMenuContent align="end" className="max-h-80 min-w-[200px] overflow-y-auto">
          {customScripts.length > 0 && (
            <>
              <DropdownMenuLabel className="text-muted-foreground text-[10px] tracking-wider uppercase">
                Custom
              </DropdownMenuLabel>
              {customScripts.map((script) => (
                <DropdownMenuItem
                  key={`custom-${script.name}`}
                  className="group gap-2"
                  onClick={() => handleRunScript(script)}
                >
                  <Play className="h-3 w-3 shrink-0" />
                  <span className="flex-1 truncate font-mono text-xs">{script.name}</span>
                  <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                    <button
                      className="hover:text-foreground rounded p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(script);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="hover:text-destructive rounded p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(script.name);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {packageScripts.length > 0 && (
            <>
              {customScripts.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground text-[10px] tracking-wider uppercase">
                package.json
              </DropdownMenuLabel>
              {packageScripts.map((script) => (
                <DropdownMenuItem
                  key={`pkg-${script.name}`}
                  onClick={() => handleRunScript(script)}
                  className="gap-2"
                >
                  <Play className="h-3 w-3 shrink-0" />
                  <span className="font-mono text-xs">{script.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {scripts.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={openAddDialog} className="gap-2">
            <Plus className="h-3 w-3 shrink-0" />
            <span className="text-xs">Add Script...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingScript ? 'Edit Script' : 'Add Custom Script'}</DialogTitle>
            <DialogDescription>
              Run any command in a specific folder within your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="script-name" className="text-xs">
                Name
              </Label>
              <Input
                id="script-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. API Server"
                disabled={!!editingScript}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="script-command" className="text-xs">
                Command
              </Label>
              <Input
                id="script-command"
                value={formCommand}
                onChange={(e) => setFormCommand(e.target.value)}
                placeholder="e.g. dotnet watch run"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="script-cwd" className="text-xs">
                Working Directory{' '}
                <span className="text-muted-foreground font-normal">
                  (relative to project root, optional)
                </span>
              </Label>
              <Input
                id="script-cwd"
                value={formCwd}
                onChange={(e) => setFormCwd(e.target.value)}
                placeholder="e.g. backend"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!formName.trim() || !formCommand.trim()}
            >
              {editingScript ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ScriptsMenu;
