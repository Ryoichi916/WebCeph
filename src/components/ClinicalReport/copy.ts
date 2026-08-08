/**
 * Wording and number formatting shared by the printed report: the "this could
 * not be computed" notes, and the typographic conventions the paper follows.
 * Kept in one place so the single-analysis report, every combined-report
 * section and the findings overview read identically.
 */

// The typographic conventions are the *app's*, not the paper's: the Summary
// dialog and the printed report show the same number to the same clinician, so
// both go through the display formatters in AnalysisResultsViewer and neither
// can drift. These aliases are kept only because "print…" reads better at the
// call sites in this folder.
import {
  displayMinus, displayNumber, displaySigned, displayNorm, displayDeviation,
} from 'components/AnalysisResultsViewer';

/** @see displayMinus — the typographic minus (U+2212) used on every surface. */
export const minusSign = displayMinus;

/** A measurement value/norm as printed on paper: 1 decimal, typographic minus. */
export const printNumber = displayNumber;

/** A signed deviation as printed on paper: "+2.6" / "−8.3", aligned widths. */
export const printSigned = displaySigned;

/**
 * A component's norm as printed on paper — "32.0 ± 5.0" for a mean ± 1 SD
 * band, "62.0–65.0" for a published range, an em dash when the app states no
 * norm. Same source of truth as the Summary dialog, with the same minus.
 */
export const printNorm = displayNorm;

/** A component's deviation as printed on paper (see `formatDeviation`). */
export const printDeviation = displayDeviation;

/** Landmark symbols listed inline before the list is abbreviated. */
const MAX_SYMBOLS = 6;

/** `"Ar, Ba, Po"`, abbreviated once the list would run past a line. */
export const formatSymbolList = (symbols: string[]): string => {
  if (symbols.length <= MAX_SYMBOLS) {
    return symbols.join(', ');
  }
  const shown = symbols.slice(0, MAX_SYMBOLS);
  return `${shown.join(', ')} and ${symbols.length - shown.length} more`;
};

/** `"1 measurement is"` / `"3 measurements are"`. */
export const measurementsAre = (count: number): string => (
  count === 1 ? '1 measurement is' : `${count} measurements are`
);

/** `"1 landmark"` / `"4 landmarks"`. */
export const landmarkCount = (count: number): string => (
  count === 1 ? '1 landmark' : `${count} landmarks`
);

/** `"1 landmark is"` / `"4 landmarks are"`. */
export const landmarksAre = (count: number): string => (
  count === 1 ? '1 landmark is' : `${count} landmarks are`
);

/** Pronoun for a list of landmarks: `"it"` or `"them"`. */
export const itOrThem = (count: number): string => (
  count === 1 ? 'it' : 'them'
);

/** Where a clinician goes to place the landmarks a measurement is waiting on. */
export const plotFromStepList = (count: number): string => (
  `plot ${itOrThem(count)} from the analysis’ step list`
);

/**
 * The footnote for measurements the geometry cannot produce yet. Names the
 * outstanding landmarks when they are known, so the note is a worklist rather
 * than an apology.
 */
export const missingLandmarksNote = (
  missingCount: number, missingSymbols: string[],
): string => {
  if (missingSymbols.length === 0) {
    return `${measurementsAre(missingCount)} waiting on landmarks that are ` +
      'not placed yet — see the analysis’ step list.';
  }
  return `${measurementsAre(missingCount)} waiting on ` +
    `${landmarkCount(missingSymbols.length)} ` +
    `(${formatSymbolList(missingSymbols)}) — ` +
    `${plotFromStepList(missingSymbols.length)}.`;
};
