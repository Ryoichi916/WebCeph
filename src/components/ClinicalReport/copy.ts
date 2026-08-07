/**
 * Wording and number formatting shared by the printed report: the "this could
 * not be computed" notes, and the typographic conventions the paper follows.
 * Kept in one place so the single-analysis report, every combined-report
 * section and the findings overview read identically.
 */

import {
  formatNumber, formatSigned, formatNorm, formatDeviation,
} from 'components/AnalysisResultsViewer';

/**
 * Replaces the ASCII hyphen-minus with the typographic minus sign (U+2212),
 * which is drawn at the same width as "+" and on the same optical axis, so
 * signed columns line up in a `tabular-nums` table. Only ever applied to an
 * already-formatted number — never to prose or measurement names, which use
 * hyphens as hyphens (`Or-Po,N-Pog`).
 */
export const minusSign = (formatted: string): string => (
  formatted.replace(/-/g, '−')
);

/** A measurement value/norm as printed on paper: 1 decimal, typographic minus. */
export const printNumber = (n: number): string => minusSign(formatNumber(n));

/** A signed deviation as printed on paper: "+2.6" / "−8.3", aligned widths. */
export const printSigned = (n: number): string => minusSign(formatSigned(n));

/**
 * A component's norm as printed on paper — "32.0 ± 5.0" for a mean ± 1 SD
 * band, "62.0–65.0" for a published range, an em dash when the app states no
 * norm. Same source of truth as the Summary dialog, with the paper's minus.
 */
export const printNorm = (
  mean: number, min: number, max: number, band?: NormBand,
): string => minusSign(formatNorm(mean, min, max, band));

/** A component's deviation as printed on paper (see `formatDeviation`). */
export const printDeviation = (
  value: number, mean: number, min: number, max: number,
  unit: string, band?: NormBand,
): string => minusSign(formatDeviation(value, mean, min, max, unit, band));

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
