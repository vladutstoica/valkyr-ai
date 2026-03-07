export type PlatformKey = 'darwin' | 'win32' | 'linux';

export type PlatformConfig = {
  openCommands?: string[];
  openUrls?: string[];
  checkCommands?: string[];
  bundleIds?: string[];
  appNames?: string[];
};

type OpenInAppConfigShape = {
  id: string;
  label: string;
  iconPath: (typeof ICON_PATHS)[keyof typeof ICON_PATHS];
  alwaysAvailable?: boolean;
  autoInstall?: boolean;
  supportsRemote?: boolean;
  platforms: Partial<Record<PlatformKey, PlatformConfig>>;
};

const ICON_PATHS = {
  finder: 'finder.png',
  cursor: 'cursorlogo.png',
  vscode: 'vscode.png',
  terminal: 'terminal.png',
  warp: 'warp.svg',
  iterm2: 'iterm2.png',
  ghostty: 'ghostty.png',
  zed: 'zed.png',
  intellij: 'intellij.svg',
  webstorm: 'webstorm.svg',
  pycharm: 'pycharm.svg',
  fleet: 'fleet.svg',
  sublime: 'sublime.svg',
  windsurf: 'windsurf.svg',
  neovim: 'neovim.svg',
  emacs: 'emacs.svg',
  alacritty: 'alacritty.svg',
  kitty: 'kitty.svg',
} as const;

export const OPEN_IN_APPS: OpenInAppConfigShape[] = [
  // ── File managers ────────────────────────────────────────────────────
  {
    id: 'finder',
    label: 'Finder',
    iconPath: ICON_PATHS.finder,
    alwaysAvailable: true,
    platforms: {
      darwin: { openCommands: ['open {{path}}'] },
      win32: { openCommands: ['explorer {{path}}'] },
      linux: { openCommands: ['xdg-open {{path}}'] },
    },
  },

  // ── Editors / IDEs ───────────────────────────────────────────────────
  {
    id: 'cursor',
    label: 'Cursor',
    iconPath: ICON_PATHS.cursor,
    autoInstall: true,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: [
          'command -v cursor >/dev/null 2>&1 && cursor {{path}}',
          'open -a "Cursor" {{path}}',
        ],
        checkCommands: ['cursor'],
        appNames: ['Cursor'],
      },
      win32: {
        openCommands: ['start "" cursor {{path}}'],
        checkCommands: ['cursor'],
      },
      linux: {
        openCommands: ['cursor {{path}}'],
        checkCommands: ['cursor'],
      },
    },
  },
  {
    id: 'vscode',
    label: 'VS Code',
    iconPath: ICON_PATHS.vscode,
    autoInstall: true,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: [
          'command -v code >/dev/null 2>&1 && code {{path}}',
          'open -n -b com.microsoft.VSCode --args {{path}}',
          'open -n -a "Visual Studio Code" {{path}}',
        ],
        checkCommands: ['code'],
        bundleIds: ['com.microsoft.VSCode', 'com.microsoft.VSCodeInsiders'],
        appNames: ['Visual Studio Code'],
      },
      win32: {
        openCommands: ['start "" code {{path}}', 'start "" code-insiders {{path}}'],
        checkCommands: ['code', 'code-insiders'],
      },
      linux: {
        openCommands: ['code {{path}}', 'code-insiders {{path}}'],
        checkCommands: ['code', 'code-insiders'],
      },
    },
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    iconPath: ICON_PATHS.windsurf,
    autoInstall: true,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: [
          'command -v windsurf >/dev/null 2>&1 && windsurf {{path}}',
          'open -a "Windsurf" {{path}}',
        ],
        checkCommands: ['windsurf'],
        appNames: ['Windsurf'],
      },
      win32: {
        openCommands: ['start "" windsurf {{path}}'],
        checkCommands: ['windsurf'],
      },
      linux: {
        openCommands: ['windsurf {{path}}'],
        checkCommands: ['windsurf'],
      },
    },
  },
  {
    id: 'intellij',
    label: 'IntelliJ IDEA',
    iconPath: ICON_PATHS.intellij,
    platforms: {
      darwin: {
        openCommands: [
          'command -v idea >/dev/null 2>&1 && idea {{path}}',
          'open -a "IntelliJ IDEA" {{path}}',
          'open -a "IntelliJ IDEA CE" {{path}}',
          'open -a "IntelliJ IDEA Ultimate" {{path}}',
        ],
        checkCommands: ['idea'],
        bundleIds: ['com.jetbrains.intellij', 'com.jetbrains.intellij.ce'],
        appNames: ['IntelliJ IDEA', 'IntelliJ IDEA CE', 'IntelliJ IDEA Ultimate'],
      },
      win32: {
        openCommands: ['start "" idea {{path}}', 'start "" idea64 {{path}}'],
        checkCommands: ['idea', 'idea64'],
      },
      linux: {
        openCommands: ['idea {{path}}'],
        checkCommands: ['idea'],
      },
    },
  },
  {
    id: 'webstorm',
    label: 'WebStorm',
    iconPath: ICON_PATHS.webstorm,
    platforms: {
      darwin: {
        openCommands: [
          'command -v webstorm >/dev/null 2>&1 && webstorm {{path}}',
          'open -a "WebStorm" {{path}}',
        ],
        checkCommands: ['webstorm'],
        bundleIds: ['com.jetbrains.WebStorm'],
        appNames: ['WebStorm'],
      },
      win32: {
        openCommands: ['start "" webstorm {{path}}', 'start "" webstorm64 {{path}}'],
        checkCommands: ['webstorm', 'webstorm64'],
      },
      linux: {
        openCommands: ['webstorm {{path}}'],
        checkCommands: ['webstorm'],
      },
    },
  },
  {
    id: 'pycharm',
    label: 'PyCharm',
    iconPath: ICON_PATHS.pycharm,
    platforms: {
      darwin: {
        openCommands: [
          'command -v pycharm >/dev/null 2>&1 && pycharm {{path}}',
          'open -a "PyCharm" {{path}}',
          'open -a "PyCharm CE" {{path}}',
        ],
        checkCommands: ['pycharm'],
        bundleIds: ['com.jetbrains.pycharm', 'com.jetbrains.pycharm.ce'],
        appNames: ['PyCharm', 'PyCharm CE'],
      },
      win32: {
        openCommands: ['start "" pycharm {{path}}', 'start "" pycharm64 {{path}}'],
        checkCommands: ['pycharm', 'pycharm64'],
      },
      linux: {
        openCommands: ['pycharm {{path}}'],
        checkCommands: ['pycharm'],
      },
    },
  },
  {
    id: 'fleet',
    label: 'Fleet',
    iconPath: ICON_PATHS.fleet,
    platforms: {
      darwin: {
        openCommands: [
          'command -v fleet >/dev/null 2>&1 && fleet {{path}}',
          'open -a "Fleet" {{path}}',
        ],
        checkCommands: ['fleet'],
        bundleIds: ['com.jetbrains.fleet'],
        appNames: ['Fleet'],
      },
      win32: {
        openCommands: ['start "" fleet {{path}}'],
        checkCommands: ['fleet'],
      },
      linux: {
        openCommands: ['fleet {{path}}'],
        checkCommands: ['fleet'],
      },
    },
  },
  {
    id: 'sublime',
    label: 'Sublime Text',
    iconPath: ICON_PATHS.sublime,
    autoInstall: true,
    platforms: {
      darwin: {
        openCommands: [
          'command -v subl >/dev/null 2>&1 && subl {{path}}',
          'open -a "Sublime Text" {{path}}',
        ],
        checkCommands: ['subl'],
        bundleIds: ['com.sublimetext.4', 'com.sublimetext.3'],
        appNames: ['Sublime Text'],
      },
      win32: {
        openCommands: ['start "" subl {{path}}'],
        checkCommands: ['subl'],
      },
      linux: {
        openCommands: ['subl {{path}}'],
        checkCommands: ['subl'],
      },
    },
  },
  {
    id: 'zed',
    label: 'Zed',
    iconPath: ICON_PATHS.zed,
    autoInstall: true,
    platforms: {
      darwin: {
        openCommands: ['command -v zed >/dev/null 2>&1 && zed {{path}}', 'open -a "Zed" {{path}}'],
        checkCommands: ['zed'],
        appNames: ['Zed'],
      },
      linux: {
        openCommands: ['zed {{path}}', 'xdg-open {{path}}'],
        checkCommands: ['zed'],
      },
    },
  },
  {
    id: 'neovim',
    label: 'Neovim',
    iconPath: ICON_PATHS.neovim,
    platforms: {
      darwin: {
        openCommands: ['open -a Terminal nvim {{path}}'],
        checkCommands: ['nvim'],
      },
      win32: {
        openCommands: ['start "" nvim {{path}}'],
        checkCommands: ['nvim'],
      },
      linux: {
        openCommands: ['x-terminal-emulator -e nvim {{path}}'],
        checkCommands: ['nvim'],
      },
    },
  },
  {
    id: 'emacs',
    label: 'Emacs',
    iconPath: ICON_PATHS.emacs,
    platforms: {
      darwin: {
        openCommands: [
          'command -v emacsclient >/dev/null 2>&1 && emacsclient -n {{path}}',
          'open -a "Emacs" {{path}}',
        ],
        checkCommands: ['emacs', 'emacsclient'],
        appNames: ['Emacs'],
      },
      win32: {
        openCommands: ['start "" emacs {{path}}', 'start "" emacsclient -n {{path}}'],
        checkCommands: ['emacs', 'emacsclient'],
      },
      linux: {
        openCommands: ['emacsclient -n {{path}}', 'emacs {{path}}'],
        checkCommands: ['emacs', 'emacsclient'],
      },
    },
  },

  // ── Terminals ────────────────────────────────────────────────────────
  {
    id: 'terminal',
    label: 'Terminal',
    iconPath: ICON_PATHS.terminal,
    alwaysAvailable: true,
    supportsRemote: true,
    platforms: {
      darwin: { openCommands: ['open -a Terminal {{path}}'] },
      win32: {
        openCommands: ['wt -d {{path}}', 'start cmd /K "cd /d {{path_raw}}"'],
      },
      linux: {
        openCommands: [
          'x-terminal-emulator --working-directory={{path}}',
          'gnome-terminal --working-directory={{path}}',
          'konsole --workdir {{path}}',
        ],
      },
    },
  },
  {
    id: 'warp',
    label: 'Warp',
    iconPath: ICON_PATHS.warp,
    supportsRemote: true,
    platforms: {
      darwin: {
        openUrls: [
          'warp://action/new_window?path={{path_url}}',
          'warppreview://action/new_window?path={{path_url}}',
        ],
        bundleIds: ['dev.warp.Warp-Stable'],
      },
    },
  },
  {
    id: 'iterm2',
    label: 'iTerm2',
    iconPath: ICON_PATHS.iterm2,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: [
          'open -b com.googlecode.iterm2 {{path}}',
          'open -a "iTerm" {{path}}',
          'open -a "iTerm2" {{path}}',
        ],
        bundleIds: ['com.googlecode.iterm2'],
        appNames: ['iTerm', 'iTerm2'],
      },
    },
  },
  {
    id: 'ghostty',
    label: 'Ghostty',
    iconPath: ICON_PATHS.ghostty,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: ['open -b com.mitchellh.ghostty {{path}}', 'open -a "Ghostty" {{path}}'],
        bundleIds: ['com.mitchellh.ghostty'],
        appNames: ['Ghostty'],
      },
      linux: {
        openCommands: ['ghostty --working-directory={{path}}'],
        checkCommands: ['ghostty'],
      },
    },
  },
  {
    id: 'alacritty',
    label: 'Alacritty',
    iconPath: ICON_PATHS.alacritty,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: [
          'command -v alacritty >/dev/null 2>&1 && alacritty --working-directory {{path}}',
          'open -a "Alacritty" --args --working-directory {{path}}',
        ],
        checkCommands: ['alacritty'],
        bundleIds: ['org.alacritty'],
        appNames: ['Alacritty'],
      },
      win32: {
        openCommands: ['start "" alacritty --working-directory {{path}}'],
        checkCommands: ['alacritty'],
      },
      linux: {
        openCommands: ['alacritty --working-directory {{path}}'],
        checkCommands: ['alacritty'],
      },
    },
  },
  {
    id: 'kitty',
    label: 'Kitty',
    iconPath: ICON_PATHS.kitty,
    supportsRemote: true,
    platforms: {
      darwin: {
        openCommands: [
          'command -v kitty >/dev/null 2>&1 && kitty --directory {{path}}',
          'open -a "kitty" --args --directory {{path}}',
        ],
        checkCommands: ['kitty'],
        bundleIds: ['net.kovidgoyal.kitty'],
        appNames: ['kitty'],
      },
      win32: {
        openCommands: ['start "" kitty --directory {{path}}'],
        checkCommands: ['kitty'],
      },
      linux: {
        openCommands: ['kitty --directory {{path}}'],
        checkCommands: ['kitty'],
      },
    },
  },
] as const;

export type OpenInAppId = (typeof OPEN_IN_APPS)[number]['id'];

export type OpenInAppConfig = OpenInAppConfigShape & { id: OpenInAppId };

export function getAppById(id: string): OpenInAppConfig | undefined {
  return OPEN_IN_APPS.find((app) => app.id === id);
}

export function isValidOpenInAppId(value: unknown): value is OpenInAppId {
  return typeof value === 'string' && OPEN_IN_APPS.some((app) => app.id === value);
}
