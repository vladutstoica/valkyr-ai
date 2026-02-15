/**
 * Monaco Editor diff color constants
 * Aligned with the app's shadcn/Tailwind theme (oklch neutral palette)
 * Uses emerald for additions and red for deletions (matching editor-diff.css)
 */

export const MONACO_DIFF_COLORS = {
  dark: {
    editorBackground: '#1c1c1c', // oklch(0.145 0 0) — app --background
    gutterBackground: '#1c1c1c',
    lineNumberForeground: '#6b6b6b', // between muted and muted-foreground
    // Emerald for additions — emerald-500 (#10b981)
    insertedTextBackground: '#10b98130',
    insertedLineBackground: '#10b98115',
    // Red for deletions — red-500 (#ef4444)
    removedTextBackground: '#ef444430',
    removedLineBackground: '#ef444415',
    unchangedRegionBackground: '#2d2d2d', // oklch(0.205 0 0) — app --card
  },
  'dark-black': {
    editorBackground: '#000000', // oklch(0 0 0) — app --background
    gutterBackground: '#000000',
    lineNumberForeground: '#555555', // muted-foreground for black theme
    // Emerald for additions — slightly higher opacity on black
    insertedTextBackground: '#10b98138',
    insertedLineBackground: '#10b9811C',
    // Red for deletions — slightly higher opacity on black
    removedTextBackground: '#ef444438',
    removedLineBackground: '#ef44441C',
    unchangedRegionBackground: '#111111', // oklch(0.1 0 0) — app --card
  },
  light: {
    editorBackground: '#ffffff', // oklch(1 0 0) — app --background
    gutterBackground: '#ffffff',
    lineNumberForeground: '#7c7c7c', // oklch(0.556 0 0) — app --muted-foreground
    // Emerald for additions
    insertedTextBackground: '#10b98130',
    insertedLineBackground: '#10b98110',
    // Red for deletions
    removedTextBackground: '#ef444430',
    removedLineBackground: '#ef444410',
    unchangedRegionBackground: '#f5f5f5', // oklch(0.97 0 0) — app --muted
  },
} as const;
