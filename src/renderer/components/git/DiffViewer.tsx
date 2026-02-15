import React, { useMemo, useRef, useEffect, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import { DiffEditor, loader } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { MONACO_DIFF_COLORS } from '@/lib/monacoDiffColors';
import { getMonacoLanguageId } from '@/lib/diffUtils';
import { configureDiffEditorDiagnostics } from '@/lib/monacoDiffConfig';

interface DiffViewerProps {
  filePath: string;
  diff: string | null;
  isLoading?: boolean;
  theme: 'light' | 'dark' | 'dark-black';
  sideBySide: boolean;
}

/**
 * Parse unified diff format into original and modified strings for Monaco
 */
function parseUnifiedDiff(patch: string): { original: string; modified: string } {
  const originalLines: string[] = [];
  const modifiedLines: string[] = [];

  for (const line of patch.split('\n')) {
    // Skip diff headers
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('@@')
    ) {
      continue;
    }

    if (line.startsWith('-')) {
      originalLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1));
    } else if (line.startsWith(' ')) {
      originalLines.push(line.slice(1));
      modifiedLines.push(line.slice(1));
    } else {
      originalLines.push(line);
      modifiedLines.push(line);
    }
  }

  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
  };
}

/**
 * Initialize Monaco themes based on MONACO_DIFF_COLORS
 */
let themesInitialized = false;
async function initializeMonacoThemes() {
  if (themesInitialized) return;
  const m = await loader.init();

  m.editor.defineTheme('emdash-diff-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': MONACO_DIFF_COLORS.dark.editorBackground,
      'editorGutter.background': MONACO_DIFF_COLORS.dark.gutterBackground,
      'editorLineNumber.foreground': MONACO_DIFF_COLORS.dark.lineNumberForeground,
      'diffEditor.insertedTextBackground': MONACO_DIFF_COLORS.dark.insertedTextBackground,
      'diffEditor.insertedLineBackground': MONACO_DIFF_COLORS.dark.insertedLineBackground,
      'diffEditor.removedTextBackground': MONACO_DIFF_COLORS.dark.removedTextBackground,
      'diffEditor.removedLineBackground': MONACO_DIFF_COLORS.dark.removedLineBackground,
      'diffEditor.unchangedRegionBackground': MONACO_DIFF_COLORS.dark.unchangedRegionBackground,
    },
  });

  m.editor.defineTheme('emdash-diff-black', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': MONACO_DIFF_COLORS['dark-black'].editorBackground,
      'editorGutter.background': MONACO_DIFF_COLORS['dark-black'].gutterBackground,
      'editorLineNumber.foreground': MONACO_DIFF_COLORS['dark-black'].lineNumberForeground,
      'diffEditor.insertedTextBackground':
        MONACO_DIFF_COLORS['dark-black'].insertedTextBackground,
      'diffEditor.insertedLineBackground':
        MONACO_DIFF_COLORS['dark-black'].insertedLineBackground,
      'diffEditor.removedTextBackground':
        MONACO_DIFF_COLORS['dark-black'].removedTextBackground,
      'diffEditor.removedLineBackground':
        MONACO_DIFF_COLORS['dark-black'].removedLineBackground,
      'diffEditor.unchangedRegionBackground':
        MONACO_DIFF_COLORS['dark-black'].unchangedRegionBackground,
    },
  });

  m.editor.defineTheme('emdash-diff-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': MONACO_DIFF_COLORS.light.editorBackground,
      'editorGutter.background': MONACO_DIFF_COLORS.light.gutterBackground,
      'editorLineNumber.foreground': MONACO_DIFF_COLORS.light.lineNumberForeground,
      'diffEditor.insertedTextBackground': MONACO_DIFF_COLORS.light.insertedTextBackground,
      'diffEditor.insertedLineBackground': MONACO_DIFF_COLORS.light.insertedLineBackground,
      'diffEditor.removedTextBackground': MONACO_DIFF_COLORS.light.removedTextBackground,
      'diffEditor.removedLineBackground': MONACO_DIFF_COLORS.light.removedLineBackground,
      'diffEditor.unchangedRegionBackground': MONACO_DIFF_COLORS.light.unchangedRegionBackground,
    },
  });

  themesInitialized = true;
}

/**
 * Error boundary for Monaco DiffEditor crashes
 */
class DiffEditorErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Monaco DiffEditor crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
          <div className="text-sm font-medium text-destructive">Failed to render diff viewer</div>
          <div className="text-xs">{this.state.error?.message || 'Unknown error'}</div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * DiffViewer component using Monaco DiffEditor
 */
export function DiffViewer({ filePath, diff, isLoading, theme, sideBySide }: DiffViewerProps) {
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  // Parse diff into original/modified format
  const parsedDiff = useMemo(() => {
    if (!diff) return null;
    return parseUnifiedDiff(diff);
  }, [diff]);

  // Get Monaco language ID from file path
  const language = useMemo(() => getMonacoLanguageId(filePath), [filePath]);

  // Map theme prop to Monaco theme name
  const monacoTheme = useMemo(() => {
    switch (theme) {
      case 'light':
        return 'emdash-diff-light';
      case 'dark-black':
        return 'emdash-diff-black';
      case 'dark':
      default:
        return 'emdash-diff-dark';
    }
  }, [theme]);

  // Imperatively update renderSideBySide when it changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ renderSideBySide: sideBySide });
    }
  }, [sideBySide]);

  // Handle editor mount
  const handleEditorDidMount = useCallback(
    (
      editor: monaco.editor.IStandaloneDiffEditor,
      monacoInstance: any // eslint-disable-line @typescript-eslint/no-explicit-any
    ) => {
      editorRef.current = editor;
      // Configure diagnostics to suppress validation errors in diff view
      configureDiffEditorDiagnostics(editor, monacoInstance, {
        disableAllValidation: true,
      });
      // Ensure renderSideBySide is set correctly on mount
      editor.updateOptions({ renderSideBySide: sideBySide });
    },
    [sideBySide]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <div className="text-sm">Loading diff...</div>
      </div>
    );
  }

  // No diff selected
  if (diff === null) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Select a file to view changes
      </div>
    );
  }

  // Empty diff
  if (diff === '') {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        No changes in this file
      </div>
    );
  }

  // No parsed data (shouldn't happen but defensive)
  if (!parsedDiff) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Unable to parse diff
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1">
        <DiffEditorErrorBoundary>
          <DiffEditor
            height="100%"
            language={language}
            original={parsedDiff.original}
            modified={parsedDiff.modified}
            theme={monacoTheme}
            beforeMount={initializeMonacoThemes}
            onMount={handleEditorDidMount}
            options={{
              readOnly: true,
              originalEditable: false,
              renderSideBySide: sideBySide,
              fontSize: 12,
              lineHeight: 18,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              lineNumbersMinChars: 3,
              automaticLayout: true,
              renderOverviewRuler: false,
              overviewRulerBorder: false,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                useShadows: false,
                verticalScrollbarSize: 4,
                horizontalScrollbarSize: 4,
              },
              hideUnchangedRegions: { enabled: true },
              diffWordWrap: 'on',
              glyphMargin: false,
              folding: false,
              padding: { top: 4, bottom: 4 },
            }}
          />
        </DiffEditorErrorBoundary>
      </div>
    </div>
  );
}

export default DiffViewer;
