import { PaletteCommand } from './commands';

/**
 * True when every character of `query` (case-insensitive) appears in `target`
 * in order, not necessarily contiguously — the same relaxed match VS Code's
 * and Sublime's command palettes use, so "trec" finds "Toggle records
 * dashboard".
 *
 * Works unmodified on Japanese input: hiragana, katakana and the common
 * (BMP) kanji are each a single UTF-16 code unit, so plain index/`toLowerCase`
 * comparisons — which is all this does — need no script-aware segmentation to
 * match or rank them correctly.
 */
export const fuzzyMatches = (query: string, target: string): boolean => {
  if (query.length === 0) {
    return true;
  }
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
};

/**
 * Commands matching `query`, ranked so a contiguous, literal match (typing the
 * start of a command's name) always sorts above a scattered fuzzy one, and a
 * match on the visible label always sorts above one that only hit a hidden
 * keyword — the fuzzy fallback exists to find a command from a rough guess, not
 * to bury the exact one a clinician typed in full.
 */
export const filterCommands = (commands: PaletteCommand[], query: string): PaletteCommand[] => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return commands;
  }
  const q = trimmed.toLowerCase();
  return commands
    .map((command) => {
      const label = command.label.toLowerCase();
      const keywords = (command.keywords || '').toLowerCase();
      if (!fuzzyMatches(q, `${label} ${keywords}`)) {
        return null;
      }
      const score = (
        label === q ? 0 :
        label.startsWith(q) ? 1 :
        label.includes(q) ? 2 :
        keywords.includes(q) ? 3 :
        4
      );
      return { command, score };
    })
    .filter((entry): entry is { command: PaletteCommand; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.command);
};
