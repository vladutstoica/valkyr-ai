import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs before any imports
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import {
  detectAndLoadTerminalConfig,
} from '../../main/services/TerminalConfigParser';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockExecSync = vi.mocked(execSync);

const originalPlatform = process.platform;

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
});

// ---------------------------------------------------------------------------
// detectAndLoadTerminalConfig — platform routing
// ---------------------------------------------------------------------------

describe('detectAndLoadTerminalConfig', () => {
  it('returns null on an unsupported platform', () => {
    setPlatform('freebsd');
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null on macOS when no terminal config files exist', () => {
    setPlatform('darwin');
    mockExistsSync.mockReturnValue(false);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null on linux when no terminal config files exist', () => {
    setPlatform('linux');
    mockExistsSync.mockReturnValue(false);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null on win32 when LOCALAPPDATA is not set', () => {
    setPlatform('win32');
    const original = process.env.LOCALAPPDATA;
    delete process.env.LOCALAPPDATA;
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
    process.env.LOCALAPPDATA = original;
  });

  it('returns null on win32 when settings.json does not exist', () => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
    mockExistsSync.mockReturnValue(false);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// macOS — iTerm2
// ---------------------------------------------------------------------------

describe('iTerm2 config parsing', () => {
  beforeEach(() => {
    setPlatform('darwin');
  });

  it('detects iTerm2 and returns a valid TerminalConfig with colors and font', () => {
    // Only the iTerm2 plist path should exist
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );

    const plistJson = JSON.stringify({
      'New Bookmarks': [
        {
          'Default Bookmark': 'Yes',
          'Color Preset Name': 'MyPreset',
          'Normal Font': 'MesloLGS-NF 14',
        },
      ],
      'Custom Color Presets': {
        MyPreset: {
          'Background Color': { 'Red Component': 0, 'Green Component': 0, 'Blue Component': 0 },
          'Foreground Color': { 'Red Component': 1, 'Green Component': 1, 'Blue Component': 1 },
          'Cursor Color': { 'Red Component': 0.5, 'Green Component': 0.5, 'Blue Component': 0.5 },
          'Selection Color': { 'Red Component': 0.2, 'Green Component': 0.4, 'Blue Component': 0.6 },
          'Ansi 0 Color': { 'Red Component': 0, 'Green Component': 0, 'Blue Component': 0 },
          'Ansi 1 Color': { 'Red Component': 1, 'Green Component': 0, 'Blue Component': 0 },
          'Ansi 2 Color': { 'Red Component': 0, 'Green Component': 1, 'Blue Component': 0 },
          'Ansi 3 Color': { 'Red Component': 1, 'Green Component': 1, 'Blue Component': 0 },
          'Ansi 4 Color': { 'Red Component': 0, 'Green Component': 0, 'Blue Component': 1 },
          'Ansi 5 Color': { 'Red Component': 1, 'Green Component': 0, 'Blue Component': 1 },
          'Ansi 6 Color': { 'Red Component': 0, 'Green Component': 1, 'Blue Component': 1 },
          'Ansi 7 Color': { 'Red Component': 1, 'Green Component': 1, 'Blue Component': 1 },
          'Ansi 8 Color': { 'Red Component': 0.5, 'Green Component': 0.5, 'Blue Component': 0.5 },
          'Ansi 9 Color': { 'Red Component': 1, 'Green Component': 0.5, 'Blue Component': 0.5 },
          'Ansi 10 Color': { 'Red Component': 0.5, 'Green Component': 1, 'Blue Component': 0.5 },
          'Ansi 11 Color': { 'Red Component': 1, 'Green Component': 1, 'Blue Component': 0.5 },
          'Ansi 12 Color': { 'Red Component': 0.5, 'Green Component': 0.5, 'Blue Component': 1 },
          'Ansi 13 Color': { 'Red Component': 1, 'Green Component': 0.5, 'Blue Component': 1 },
          'Ansi 14 Color': { 'Red Component': 0.5, 'Green Component': 1, 'Blue Component': 1 },
          'Ansi 15 Color': { 'Red Component': 1, 'Green Component': 1, 'Blue Component': 1 },
        },
      },
    });

    mockExecSync.mockReturnValue(plistJson as any);

    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('iTerm2');
    expect(result!.theme.background).toBe('#000000');
    expect(result!.theme.foreground).toBe('#ffffff');
    expect(result!.theme.cursor).toBe('#808080');
    expect(result!.theme.black).toBe('#000000');
    expect(result!.theme.red).toBe('#ff0000');
    expect(result!.theme.green).toBe('#00ff00');
    expect(result!.theme.yellow).toBe('#ffff00');
    expect(result!.theme.blue).toBe('#0000ff');
    expect(result!.theme.magenta).toBe('#ff00ff');
    expect(result!.theme.cyan).toBe('#00ffff');
    expect(result!.theme.white).toBe('#ffffff');
    expect(result!.theme.fontFamily).toBe('MesloLGS-NF');
    expect(result!.theme.fontSize).toBe(14);
  });

  it('returns null when iTerm2 plist has no bookmarks', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    mockExecSync.mockReturnValue(JSON.stringify({ 'New Bookmarks': [] }) as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null when default profile has no Color Preset Name', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    mockExecSync.mockReturnValue(
      JSON.stringify({ 'New Bookmarks': [{ 'Default Bookmark': 'Yes' }] }) as any
    );
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('falls back to XML parser when plutil fails, returning null for basic XML', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    mockExecSync.mockImplementation(() => {
      throw new Error('plutil failed');
    });
    // XML fallback currently returns null
    mockReadFileSync.mockReturnValue('<plist></plist>' as any);
    const result = detectAndLoadTerminalConfig();
    // loadiTerm2ConfigXML always returns null — check graceful fallthrough
    expect(result).toBeNull();
  });

  it('returns null when plist JSON is invalid', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    mockExecSync.mockReturnValue('not-valid-json' as any);
    // Should not throw; returns null and falls through to next terminal
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('uses first bookmark if none is marked as default', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    const plistJson = JSON.stringify({
      'New Bookmarks': [{ 'Color Preset Name': 'APreset' }],
      'Custom Color Presets': {
        APreset: {
          'Background Color': { 'Red Component': 0.1, 'Green Component': 0.2, 'Blue Component': 0.3 },
        },
      },
    });
    mockExecSync.mockReturnValue(plistJson as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('iTerm2');
    expect(result!.theme.background).toBe('#1a334d'); // 0.1*255=25.5→26=0x1a, 0.2*255=51=0x33, 0.3*255=76.5→77=0x4d
  });

  it('handles color preset already stored as a hex string', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    const plistJson = JSON.stringify({
      'New Bookmarks': [{ 'Color Preset Name': 'FlatPreset' }],
      'Custom Color Presets': {
        FlatPreset: {
          'Background Color': '#1c1c1e',
          'Foreground Color': '#f2f2f2',
        },
      },
    });
    mockExecSync.mockReturnValue(plistJson as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.theme.background).toBe('#1c1c1e');
    expect(result!.theme.foreground).toBe('#f2f2f2');
  });

  it('skips font parsing when Normal Font does not match expected format', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.googlecode.iterm2.plist')
    );
    const plistJson = JSON.stringify({
      'New Bookmarks': [{ 'Color Preset Name': 'P', 'Normal Font': 'NoSpaceFont' }],
      'Custom Color Presets': { P: {} },
    });
    mockExecSync.mockReturnValue(plistJson as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.theme.fontFamily).toBeUndefined();
    expect(result!.theme.fontSize).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// macOS — Terminal.app
// ---------------------------------------------------------------------------

describe('Terminal.app config parsing', () => {
  beforeEach(() => {
    setPlatform('darwin');
    // iTerm2 plist absent, Terminal.app plist present
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('com.apple.Terminal.plist')
    );
  });

  it('detects Terminal.app and returns a valid config', () => {
    const plistJson = JSON.stringify({
      'Default Window Settings': 'Basic',
      'Window Settings': {
        Basic: {
          BackgroundColor: { 'Red Component': 0, 'Green Component': 0, 'Blue Component': 0 },
          TextColor: { 'Red Component': 1, 'Green Component': 1, 'Blue Component': 1 },
          CursorColor: { 'Red Component': 0.5, 'Green Component': 0.5, 'Blue Component': 0.5 },
          ANSIBlackColor: { 'Red Component': 0, 'Green Component': 0, 'Blue Component': 0 },
          ANSIRedColor: { 'Red Component': 1, 'Green Component': 0, 'Blue Component': 0 },
          Font: 'Monaco 13',
        },
      },
    });
    mockExecSync.mockReturnValue(plistJson as any);

    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Terminal.app');
    expect(result!.theme.background).toBe('#000000');
    expect(result!.theme.foreground).toBe('#ffffff');
    expect(result!.theme.cursor).toBe('#808080');
    expect(result!.theme.black).toBe('#000000');
    expect(result!.theme.red).toBe('#ff0000');
    expect(result!.theme.fontFamily).toBe('Monaco');
    expect(result!.theme.fontSize).toBe(13);
  });

  it('returns null when the default profile is missing from Window Settings', () => {
    const plistJson = JSON.stringify({
      'Default Window Settings': 'NonExistent',
      'Window Settings': {},
    });
    mockExecSync.mockReturnValue(plistJson as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null when plist JSON parsing fails', () => {
    mockExecSync.mockReturnValue('broken json' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null when plutil fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('plutil unavailable');
    });
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('maps all ANSI colors from Terminal.app profile', () => {
    const colorNames = [
      'ANSIBlackColor', 'ANSIRedColor', 'ANSIGreenColor', 'ANSIYellowColor',
      'ANSIBlueColor', 'ANSIMagentaColor', 'ANSICyanColor', 'ANSIWhiteColor',
      'ANSIBrightBlackColor', 'ANSIBrightRedColor', 'ANSIBrightGreenColor',
      'ANSIBrightYellowColor', 'ANSIBrightBlueColor', 'ANSIBrightMagentaColor',
      'ANSIBrightCyanColor', 'ANSIBrightWhiteColor',
    ];
    const profile: Record<string, unknown> = {};
    colorNames.forEach((name) => {
      profile[name] = { 'Red Component': 0.5, 'Green Component': 0.5, 'Blue Component': 0.5 };
    });
    const plistJson = JSON.stringify({
      'Default Window Settings': 'Profile',
      'Window Settings': { Profile: profile },
    });
    mockExecSync.mockReturnValue(plistJson as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    const theme = result!.theme;
    expect(theme.black).toBe('#808080');
    expect(theme.brightWhite).toBe('#808080');
  });
});

// ---------------------------------------------------------------------------
// Alacritty — TOML
// ---------------------------------------------------------------------------

describe('Alacritty TOML config parsing', () => {
  beforeEach(() => {
    setPlatform('darwin');
    // Alacritty TOML path present
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('alacritty.toml')
    );
  });

  const minimalToml = `
[colors]
background = '#1d1f21'
foreground = '#c5c8c6'
cursor = '#f8f8f2'
black = '#1d1f21'
red = '#cc6666'
green = '#b5bd68'
yellow = '#f0c674'
blue = '#81a2be'
magenta = '#b294bb'
cyan = '#8abeb7'
white = '#c5c8c6'
bright_black = '#666666'
bright_red = '#d54e53'
bright_green = '#b9ca4a'
bright_yellow = '#e7c547'
bright_blue = '#7aa6da'
bright_magenta = '#c397d8'
bright_cyan = '#70c0b1'
bright_white = '#eaeaea'

[font]
size = 12
normal = { family = "FiraCode Nerd Font" }
`;

  it('parses Alacritty TOML and returns a valid config', () => {
    mockReadFileSync.mockReturnValue(minimalToml as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Alacritty');
    expect(result!.theme.background).toBe('#1d1f21'); // regex captures content between quotes, quotes are not included
    expect(result!.theme.red).toBeDefined();
    expect(result!.theme.brightBlack).toBeDefined();
    expect(result!.theme.fontSize).toBe(12);
    expect(result!.theme.fontFamily).toBe('FiraCode Nerd Font');
  });

  it('returns null when content has no [colors] section', () => {
    mockReadFileSync.mockReturnValue('[font]\nsize = 12\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns Alacritty config even when colors section is empty (no colors matched)', () => {
    mockReadFileSync.mockReturnValue('[colors]\n' as any);
    const result = detectAndLoadTerminalConfig();
    // parseAlacrittyTOML returns an object with empty theme when [colors] exists
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Alacritty');
    expect(result!.theme.background).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Alacritty — YAML fallback
// ---------------------------------------------------------------------------

describe('Alacritty YAML config parsing', () => {
  beforeEach(() => {
    setPlatform('linux');
    // TOML absent, YAML present
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('alacritty.yml')
    );
  });

  it('falls back to YAML when TOML is missing and extracts background/foreground', () => {
    const yamlContent = `
colors:
  primary:
    background: '#1d1f21'
    foreground: '#c5c8c6'
`;
    mockReadFileSync.mockReturnValue(yamlContent as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Alacritty');
    expect(result!.theme.background).toBeDefined();
    expect(result!.theme.foreground).toBeDefined();
  });

  it('returns null when YAML file cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ghostty
// ---------------------------------------------------------------------------

describe('Ghostty config parsing', () => {
  beforeEach(() => {
    setPlatform('darwin');
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('ghostty')
    );
  });

  const ghosttyConfig = `
# Ghostty config
background = 1d1f21
foreground = c5c8c6
cursor = f8f8f2
color0 = 1d1f21
color1 = cc6666
color2 = b5bd68
color3 = f0c674
color4 = 81a2be
color5 = b294bb
color6 = 8abeb7
color7 = c5c8c6
color8 = 666666
color9 = d54e53
color10 = b9ca4a
color11 = e7c547
color12 = 7aa6da
color13 = c397d8
color14 = 70c0b1
color15 = eaeaea
font = FiraCode Nerd Font
font-size = 14
`;

  it('parses Ghostty config and returns all 16 ANSI colors', () => {
    mockReadFileSync.mockReturnValue(ghosttyConfig as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Ghostty');
    expect(result!.theme.background).toBe('1d1f21');
    expect(result!.theme.foreground).toBe('c5c8c6');
    expect(result!.theme.cursor).toBe('f8f8f2');
    expect(result!.theme.black).toBe('1d1f21');
    expect(result!.theme.red).toBe('cc6666');
    expect(result!.theme.green).toBe('b5bd68');
    expect(result!.theme.yellow).toBe('f0c674');
    expect(result!.theme.blue).toBe('81a2be');
    expect(result!.theme.magenta).toBe('b294bb');
    expect(result!.theme.cyan).toBe('8abeb7');
    expect(result!.theme.white).toBe('c5c8c6');
    expect(result!.theme.brightBlack).toBe('666666');
    expect(result!.theme.brightRed).toBe('d54e53');
    expect(result!.theme.brightGreen).toBe('b9ca4a');
    expect(result!.theme.brightYellow).toBe('e7c547');
    expect(result!.theme.brightBlue).toBe('7aa6da');
    expect(result!.theme.brightMagenta).toBe('c397d8');
    expect(result!.theme.brightCyan).toBe('70c0b1');
    expect(result!.theme.brightWhite).toBe('eaeaea');
    expect(result!.theme.fontFamily).toBe('FiraCode Nerd Font');
    expect(result!.theme.fontSize).toBe(14);
  });

  it('skips comment lines and lines without = separator', () => {
    const configWithComments = `
# This is a comment
background = 000000
justakeynoequals
`;
    mockReadFileSync.mockReturnValue(configWithComments as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.theme.background).toBe('000000');
  });

  it('strips surrounding quotes from values', () => {
    mockReadFileSync.mockReturnValue('background = "1d1f21"\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result!.theme.background).toBe('1d1f21');
  });

  it('returns null when Ghostty config file cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('handles values containing = signs (e.g., URLs)', () => {
    mockReadFileSync.mockReturnValue('background = abc=def\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result!.theme.background).toBe('abc=def');
  });
});

// ---------------------------------------------------------------------------
// Kitty
// ---------------------------------------------------------------------------

describe('Kitty config parsing', () => {
  beforeEach(() => {
    setPlatform('linux');
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('kitty.conf')
    );
  });

  const kittyConfig = `
# Kitty config
background #1d1f21
foreground #c5c8c6
cursor #f8f8f2
color0 #1d1f21
color1 #cc6666
color2 #b5bd68
color3 #f0c674
color4 #81a2be
color5 #b294bb
color6 #8abeb7
color7 #c5c8c6
color8 #666666
color9 #d54e53
color10 #b9ca4a
color11 #e7c547
color12 #7aa6da
color13 #c397d8
color14 #70c0b1
color15 #eaeaea
font_family FiraCode Nerd Font
font_size 14
`;

  it('parses Kitty config and returns all 16 ANSI colors plus font', () => {
    mockReadFileSync.mockReturnValue(kittyConfig as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Kitty');
    expect(result!.theme.background).toBe('#1d1f21');
    expect(result!.theme.foreground).toBe('#c5c8c6');
    expect(result!.theme.cursor).toBe('#f8f8f2');
    expect(result!.theme.black).toBe('#1d1f21');
    expect(result!.theme.red).toBe('#cc6666');
    expect(result!.theme.green).toBe('#b5bd68');
    expect(result!.theme.yellow).toBe('#f0c674');
    expect(result!.theme.blue).toBe('#81a2be');
    expect(result!.theme.magenta).toBe('#b294bb');
    expect(result!.theme.cyan).toBe('#8abeb7');
    expect(result!.theme.white).toBe('#c5c8c6');
    expect(result!.theme.brightBlack).toBe('#666666');
    expect(result!.theme.brightRed).toBe('#d54e53');
    expect(result!.theme.brightGreen).toBe('#b9ca4a');
    expect(result!.theme.brightYellow).toBe('#e7c547');
    expect(result!.theme.brightBlue).toBe('#7aa6da');
    expect(result!.theme.brightMagenta).toBe('#c397d8');
    expect(result!.theme.brightCyan).toBe('#70c0b1');
    expect(result!.theme.brightWhite).toBe('#eaeaea');
    expect(result!.theme.fontFamily).toBe('FiraCode Nerd Font');
    expect(result!.theme.fontSize).toBe(14);
  });

  it('skips comment lines (lines starting with #)', () => {
    mockReadFileSync.mockReturnValue('# background #000000\nforeground #ffffff\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.theme.background).toBeUndefined();
    expect(result!.theme.foreground).toBe('#ffffff');
  });

  it('skips lines without whitespace separator', () => {
    mockReadFileSync.mockReturnValue('nospace\nbackground #111111\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result!.theme.background).toBe('#111111');
  });

  it('returns null when kitty.conf cannot be read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Windows Terminal
// ---------------------------------------------------------------------------

describe('Windows Terminal config parsing', () => {
  beforeEach(() => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('Microsoft.WindowsTerminal_8wekyb3d8bbwe')
    );
  });

  afterEach(() => {
    delete process.env.LOCALAPPDATA;
  });

  const makeWtSettings = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      profiles: {
        list: [
          {
            default: true,
            colorScheme: 'One Half Dark',
            font: { face: 'Cascadia Code', size: 12 },
          },
        ],
      },
      schemes: [
        {
          name: 'One Half Dark',
          background: '#282C34',
          foreground: '#DCDFE4',
          black: '#282C34',
          red: '#E06C75',
          green: '#98C379',
          yellow: '#E5C07B',
          blue: '#61AFEF',
          magenta: '#C678DD',
          cyan: '#56B6C2',
          white: '#DCDFE4',
          brightBlack: '#5A6374',
          brightRed: '#E06C75',
          brightGreen: '#98C379',
          brightYellow: '#E5C07B',
          brightBlue: '#61AFEF',
          brightMagenta: '#C678DD',
          brightCyan: '#56B6C2',
          brightWhite: '#DCDFE4',
        },
      ],
      ...overrides,
    });

  it('detects Windows Terminal and returns a full theme', () => {
    mockReadFileSync.mockReturnValue(makeWtSettings() as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Windows Terminal');
    expect(result!.theme.background).toBe('#282C34');
    expect(result!.theme.foreground).toBe('#DCDFE4');
    expect(result!.theme.black).toBe('#282C34');
    expect(result!.theme.brightWhite).toBe('#DCDFE4');
    expect(result!.theme.fontFamily).toBe('Cascadia Code');
    expect(result!.theme.fontSize).toBe(12);
  });

  it('returns null when profiles list is empty', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ profiles: { list: [] }, schemes: [] }) as any
    );
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('uses first profile when none is marked as default', () => {
    const settings = JSON.stringify({
      profiles: {
        list: [{ colorScheme: 'Campbell', font: { face: 'Consolas', size: 11 } }],
      },
      schemes: [{ name: 'Campbell', background: '#0C0C0C', foreground: '#CCCCCC' }],
    });
    mockReadFileSync.mockReturnValue(settings as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.theme.background).toBe('#0C0C0C');
  });

  it('returns Windows Terminal config without color scheme when no matching scheme found', () => {
    const settings = JSON.stringify({
      profiles: { list: [{ default: true, colorScheme: 'Missing', font: { face: 'Consolas', size: 11 } }] },
      schemes: [],
    });
    mockReadFileSync.mockReturnValue(settings as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.terminal).toBe('Windows Terminal');
    expect(result!.theme.background).toBeUndefined();
  });

  it('returns Windows Terminal config without font when font property is absent', () => {
    const settings = JSON.stringify({
      profiles: { list: [{ default: true }] },
      schemes: [],
    });
    mockReadFileSync.mockReturnValue(settings as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).not.toBeNull();
    expect(result!.theme.fontFamily).toBeUndefined();
  });

  it('returns null when settings.json contains invalid JSON', () => {
    mockReadFileSync.mockReturnValue('{ bad json }' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });

  it('returns null when settings.json read throws', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Access denied');
    });
    const result = detectAndLoadTerminalConfig();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// macOS detection priority order
// ---------------------------------------------------------------------------

describe('macOS terminal detection priority', () => {
  beforeEach(() => {
    setPlatform('darwin');
  });

  it('prefers iTerm2 over Terminal.app when both plist files exist', () => {
    mockExistsSync.mockReturnValue(true);
    const plistJson = JSON.stringify({
      'New Bookmarks': [{ 'Color Preset Name': 'P' }],
      'Custom Color Presets': {
        P: { 'Background Color': { 'Red Component': 0.1, 'Green Component': 0.2, 'Blue Component': 0.3 } },
      },
    });
    mockExecSync.mockReturnValue(plistJson as any);
    const result = detectAndLoadTerminalConfig();
    expect(result!.terminal).toBe('iTerm2');
  });

  it('falls through to Ghostty when iTerm2, Terminal.app, and Alacritty are absent', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('ghostty')
    );
    mockReadFileSync.mockReturnValue('background = 000000\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result!.terminal).toBe('Ghostty');
  });

  it('falls through to Kitty when iTerm2, Terminal.app, Alacritty, and Ghostty are absent', () => {
    mockExistsSync.mockImplementation((p: unknown) =>
      typeof p === 'string' && p.includes('kitty.conf')
    );
    mockReadFileSync.mockReturnValue('background #000000\n' as any);
    const result = detectAndLoadTerminalConfig();
    expect(result!.terminal).toBe('Kitty');
  });
});
