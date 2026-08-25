import React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import IconClose from 'material-ui/svg-icons/navigation/close';
import IconCopy from 'material-ui/svg-icons/content/content-copy';
import IconCheck from 'material-ui/svg-icons/navigation/check';
import IconDownload from 'material-ui/svg-icons/file/file-download';

import * as cx from 'classnames';

import map from 'lodash/map';

import Props from './props';

import {
  mapCategoryToString,
  mapIndicationToString,
} from './strings';

// One measurement, one row — shared with the printed report so the same
// tracing is typeset the same way on screen and on paper.
import {
  groupFindings, alsoFindingLabel, AlsoFinding, chipToneFor,
  findGroupDivergence, GroupDivergence,
} from './grouping';

import {
  formatCaptureDate,
  getTimepointToken,
  getImpliedFilmSize,
  FILM_SIZE_BAND,
} from 'utils/records';

import {
  hasNorm, isSdBand, normSd, rangeExcess,
  gradeAgainstNorm, NEUTRAL_CATEGORY, NEUTRAL_GRADE_LABELS,
} from 'analyses/helpers';

import LATERAL_ANALYSES from 'analyses/lateral';

// `saveBlobAs` replaces `file-saver`'s saveAs(): see its doc comment for why
// (a webpack chunk boundary between file-saver and its caller silently
// drops the filename).
import { saveBlobAs } from 'utils/tracingSnapshot';

const classes = require('./style.scss');

/**
 * Display names for the analysis badge in the dialog header.
 * Exported (with the formatters below) for the printable clinical report,
 * which must match this dialog's conventions exactly.
 *
 * Every shipped lateral analysis is seeded from `LATERAL_ANALYSES` — the same
 * source the toolbar menu and the combined report read — so the three can never
 * disagree about what an analysis is called. Keying this map by hand had already
 * let them drift: the store keeps the analysis *module* name (`ricketts`) while
 * only the module's own `analysis.id` (`ricketts_lateral`) was listed here, so
 * the summary header and the single-analysis report both printed a bare
 * lowercase "ricketts" where the toolbar and the combined report said
 * "Ricketts".
 *
 * The entries below the seed are the ids that are not lateral analyses in their
 * own right: `basic` and `common` (composed building blocks) and the legacy
 * `analysis.id` spellings that older saved projects still carry.
 */
export const ANALYSIS_NAMES: { [id: string]: string | undefined } = {
  ...LATERAL_ANALYSES.reduce(
    (names, { id, name }) => Object.assign(names, { [id]: name }),
    {} as { [id: string]: string | undefined },
  ),
  basic: 'Basic',
  common: 'Common',
  ricketts_lateral: 'Ricketts',
  soft_tissues_lateral: 'Soft tissues',
};

// One decimal everywhere (design brief); avoid the "-0.0" artifact.
export const formatNumber = (n: number): string => {
  const s = n.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
};

/**
 * A value rounded to the one decimal it is *shown* at — `formatNumber`'s
 * rounding, as a number.
 *
 * For arithmetic that a reader can check against the printed columns: a
 * difference taken between two full-precision values can contradict the same
 * difference taken between the two figures on screen (−0.9 and −0.8 printed
 * with a change of "—", because the true change was 0.04). Rounding first is
 * what makes a printed row add up.
 */
export const roundToDisplay = (n: number): number => parseFloat(n.toFixed(1));

// Signed deviation, e.g. "+3.4" / "-29.9"; a rounded zero gets no sign.
export const formatSigned = (n: number): string => {
  const s = formatNumber(Math.abs(n));
  if (s === '0.0') {
    return '0.0';
  }
  return (n < 0 ? '-' : '+') + s;
};

/** Unit suffix for a measurement, e.g. `°` for angles, ` mm` for distances. */
export const getUnitSuffix = (landmark?: CephLandmark): string => {
  if (landmark === undefined) {
    return '';
  }
  if (landmark.type === 'angle' || landmark.type === 'sum' || landmark.unit === 'degree') {
    return '°';
  }
  if (landmark.unit === 'mm' || landmark.unit === 'cm' || landmark.unit === 'in') {
    return ` ${landmark.unit}`;
  }
  // Dimensionless measurements expressed as a percentage (facial-height ratio).
  if (landmark.unit === 'percent') {
    return ' %';
  }
  return '';
};

/**
 * Number of severity markers for a value, following the clinical convention
 * of the reference software: one star per full standard deviation beyond the
 * first, capped at three.
 *
 * **Only a component whose norm is a real mean ± 1 SD band can carry stars.**
 * A component whose author published a plain range (`band: 'range'`) has no
 * standard deviation, and halving the range to manufacture one is how this
 * table came to print "+9.3 % ***" — a claimed six-SD finding — for Jarabak's
 * 62–65 % ratio. `normSd` returns NaN for those, and NaN fails every
 * comparison below, so they score zero stars by construction.
 */
export const getSeverityStars = (
  value: number, mean: number, min: number, max: number, band?: NormBand,
): 0 | 1 | 2 | 3 => {
  // A measurement reported without a published norm (see `NO_NORM`) has
  // nothing to deviate from, so it carries no severity markers.
  const sd = normSd(mean, min, max, band);
  if (!(sd > 0)) {
    return 0;
  }
  const t = Math.abs(value - mean) / sd;
  if (t >= 3) {
    return 3;
  }
  if (t >= 2) {
    return 2;
  }
  if (t >= 1) {
    return 1;
  }
  return 0;
};

export const STARS: { [n: number]: string } = { 1: '*', 2: '**', 3: '***' };

/**
 * What the norm column shows for a measurement the app reports without a
 * published norm: an em dash, never a plausible-looking number. Same string in
 * the deviation column, since there is nothing to deviate from.
 */
export const NO_NORM_TEXT = '—';

/**
 * The bounds of a published range, e.g. "62.0–65.0". A range that reaches
 * below zero is written "-1.0 to 1.0" instead: an en dash between a negative
 * lower bound and its upper bound reads as a subtraction.
 */
export const formatRange = (min: number, max: number): string => (
  min < 0
    ? `${formatNumber(min)} to ${formatNumber(max)}`
    : `${formatNumber(min)}–${formatNumber(max)}`
);

/**
 * The norm cell's text for any component, in one place so the dialog, the
 * printed report and the clipboard/CSV export can never describe the same
 * norm three different ways.
 *
 * `isTarget` (see `AnalysisComponent.isTarget`) keeps a published *target*
 * printed beside its range instead of hidden by it: Tweed's 25/90/65 are
 * figures a clinician actually treats toward, and a norm cell that showed
 * only "20.0–30.0" left the number that drives his own treatment plan
 * recoverable only from the provenance prose underneath. A plain range with no
 * stated target (Björk's gonial halves, Jarabak's ratio) still prints bounds
 * alone — inventing a "target" for those would resurrect exactly the
 * manufactured-figure problem `RANGE` exists to prevent.
 */
export const formatNorm = (
  mean: number, min: number, max: number, band?: NormBand, isTarget?: boolean,
): string => {
  if (!hasNorm(mean, min, max)) {
    return NO_NORM_TEXT;
  }
  if (!isSdBand(band)) {
    return isTarget
      ? `${formatNumber(mean)} · range ${formatRange(min, max)}`
      : formatRange(min, max);
  }
  return `${formatNumber(mean)} ± ${formatNumber((max - min) / 2)}`;
};

/** What a range component's deviation column says while the value is inside. */
export const IN_RANGE_TEXT = 'in range';

/**
 * The deviation cell's text. An SD component reports its signed distance from
 * the mean; a plain-range component reports how far it lies beyond the
 * nearer bound (and says "in range" while it lies between them), because a
 * range with no stated target has no figure to subtract from. A **target**
 * range (`isTarget`) does have one — Tweed plans treatment on how far FMIA
 * sits from 65°, not on whether it has crossed 60° or 70° — so it reports the
 * signed distance from that target the same way an SD component does, still
 * carrying no stars (see `getSeverityStars`).
 */
export const formatDeviation = (
  value: number, mean: number, min: number, max: number,
  unit: string, band?: NormBand, isTarget?: boolean,
): string => {
  if (!hasNorm(mean, min, max)) {
    return NO_NORM_TEXT;
  }
  if (!isSdBand(band)) {
    if (isTarget) {
      return `${formatSigned(value - mean)}${unit}`;
    }
    const excess = rangeExcess(value, min, max);
    return excess === 0 ? IN_RANGE_TEXT : `${formatSigned(excess)}${unit}`;
  }
  return `${formatSigned(value - mean)}${unit}`;
};

/**
 * Replaces the ASCII hyphen-minus with the typographic minus sign (U+2212),
 * which is drawn at the same width as "+" and on the same optical axis, so
 * signed columns line up in a `tabular-nums` table.
 *
 * **Every surface that shows a number to a person goes through this**: the
 * Summary dialog used to print "-5.8°" while the printed report printed
 * "−5.8°", so a value read off the screen did not match the character in the
 * document filed in the chart. The machine-readable formatters above keep the
 * ASCII hyphen, because the CSV/clipboard export is parsed by a spreadsheet.
 *
 * Only ever applied to an already-formatted number — never to prose or
 * measurement names, which use hyphens as hyphens (`Or-Po,N-Pog`).
 */
export const displayMinus = (formatted: string): string => (
  formatted.replace(/-/g, '−')
);

/** A value/norm as shown to a clinician: 1 decimal, typographic minus. */
export const displayNumber = (n: number): string => displayMinus(formatNumber(n));

/** A signed deviation as shown: "+2.6" / "−8.3", aligned widths. */
export const displaySigned = (n: number): string => displayMinus(formatSigned(n));

/** `formatNorm` with the display minus (see `displayMinus`). */
export const displayNorm = (
  mean: number, min: number, max: number, band?: NormBand, isTarget?: boolean,
): string => displayMinus(formatNorm(mean, min, max, band, isTarget));

/** `formatDeviation` with the display minus (see `displayMinus`). */
export const displayDeviation = (
  value: number, mean: number, min: number, max: number,
  unit: string, band?: NormBand, isTarget?: boolean,
): string => displayMinus(
  formatDeviation(value, mean, min, max, unit, band, isTarget),
);

// The chip tone of a finding, and the order a list of them is read in, now live
// beside `groupFindings` (see `./grouping`) — a pure module the records
// dashboard's panel can import without pulling a dialog in with it. Re-exported
// here because this is where every surface has always imported them from.
export {
  ChipTone,
  HeadlineFinding,
  FindingOrder,
  isNormalIndication,
  chipToneFor,
  orderFindings,
  findingOrderOf,
} from './grouping';

/**
 * The one-line citation for an analysis' norms: author, year and the sample
 * they were measured on — "Downs 1948 · 20 North American white adolescents,
 * 12–17 y".
 *
 * Exported so the Summary dialog and the printed report cite the same norms in
 * the same words. A cephalometric norm is a sample statistic, and a table of
 * deviations that never names the sample lets one author's twenty adolescents
 * pass for the definition of normal.
 */
export const formatProvenanceSource = (p: NormsProvenance): string => (
  `${p.author} ${p.year} · ${p.population}`
);

/**
 * The sentence every surface that prints a norm has to carry once: these
 * samples are not this patient. Ethnicity, age and sex all move cephalometric
 * means by more than the standard deviations the star scale grades against.
 */
export const NORMS_NOT_MATCHED =
  'Published norms are not matched to this patient’s ethnicity, age or sex. ' +
  'Read a deviation as a difference from the cited sample, not as a ' +
  'diagnosis.';

/**
 * The mm rows of this table are present but derived from a calibration that
 * cannot be right (see `getImpliedFilmSize`). One sentence, so the dialog and
 * the clipboard/CSV export — the surface most likely to carry a wrong number
 * onward with nothing saying why — print it identically.
 */
export const formatScaleSuspectNote = (
  filmSize: { label: string },
): string => (
  `The image scale makes this film ${filmSize.label} — outside the ` +
  `${FILM_SIZE_BAND.minMm}–${FILM_SIZE_BAND.maxMm} mm a cephalogram ` +
  `measures. Every millimetre value above is derived from that scale and is ` +
  `wrong by the same factor if it is; angles and ratios are unaffected. ` +
  `Re-calibrate from the ruler chip in the toolbar.`
);

/**
 * This analysis interprets linear (mm) measurements that are missing from the
 * table because the image carries no scale — accounted for here rather than
 * left as a silent gap, on screen and in the export alike.
 */
export const LINEAR_NEEDS_SCALE_NOTE =
  'Linear measurements need an image scale — set it from the calibration ' +
  'chip in the toolbar. Angular values are unaffected.';

/**
 * A `sum`-type row (Björk's total, Tweed's triangle closure) prints its own
 * full-precision total, not the sum of the *rounded* figures printed two rows
 * up for its own parts — `roundToDisplay`'s docstring names exactly this as
 * the arithmetic a reader must be able to check against the printed columns.
 * Re-deriving the total from rounded parts would fix the printed checksum at
 * the cost of moving a row's grading away from the value the analysis
 * actually computed (a total that rounds to the grading boundary either way);
 * this footnote instead says, once, why the two do not always match.
 */
export const SUM_ROUNDING_NOTE =
  'A row that sums other angles in this table (Björk\'s total, Tweed\'s ' +
  'triangle closure) totals the full-precision values, not the rounded ' +
  'figures printed for its own parts above it — adding those exactly as ' +
  'printed can read up to 0.1° off the total shown, which remains correct.';

/**
 * The provenance block that opens the clipboard/CSV export.
 *
 * The exported table is the artifact most likely to end up pasted into a chart
 * note or a spreadsheet, where none of the app's own framing travels with it —
 * and this file's own docstring states the principle the export used to
 * violate: "a table of deviations that never names the sample lets one author's
 * twenty adolescents pass for the definition of normal". A deviation column
 * detached from its citation is exactly that table.
 *
 * Written as leading `key<TAB>value` lines rather than as extra columns so the
 * numbers below stay a clean rectangle a spreadsheet can sort.
 *
 * `caveats`, `scaleSuspectNote` and `linearNeedsScaleNote` carry the same
 * warnings the dialog prints under the table (see `render`) into the export.
 * They used to stop at the dialog's edge: a pasted spreadsheet showed
 * Björk's three articulare-flagged rows starred red with nothing saying they
 * may be an artefact, and a mis-scaled film's millimetre values travelled
 * with no note that the scale itself was suspect — exactly the silent
 * handoff this block exists to prevent for the norms citation.
 */
const buildProvenanceRows = (
  analysisId: string | null,
  provenance: NormsProvenance | null,
  captureDate: string | null,
  timepoint: string | null,
  patientNote?: string,
  caveats: AnalysisCaveat[] = [],
  scaleSuspectNote: string | null = null,
  linearNeedsScaleNote: string | null = null,
  sumRoundingNote: string | null = null,
): string[][] => {
  const rows: string[][] = [];
  const analysisName = analysisId !== null
    ? (ANALYSIS_NAMES[analysisId] || analysisId)
    : null;
  if (analysisName !== null) {
    rows.push(['Analysis', analysisName]);
  }
  if (timepoint !== null) {
    rows.push(['Timepoint', timepoint]);
  }
  const filmDate = formatCaptureDate(captureDate);
  if (filmDate !== null) {
    rows.push(['Film date', filmDate]);
  }
  if (provenance !== null) {
    rows.push(['Norms', formatProvenanceSource(provenance)]);
    if (provenance.alsoFrom !== undefined && provenance.alsoFrom.length > 0) {
      provenance.alsoFrom.forEach((entry, i) => {
        rows.push([i === 0 ? 'Also from' : '', entry]);
      });
    }
    if (provenance.note !== undefined) {
      rows.push(['Note', provenance.note]);
    }
    // What this reading did with this patient's record — an author's age
    // correction or sex split applied, or the reason it was not. The dialog
    // states it under the norms block; an export that drops it hands the
    // reader age-corrected norm columns with nothing saying they were
    // corrected, which is exactly the kind of silent rewriting the norm
    // columns exist to prevent.
    if (patientNote !== undefined) {
      rows.push(['Applied', patientNote]);
    }
  }
  rows.push(['Caveat', NORMS_NOT_MATCHED]);
  // A warning the analysis draws from its own numbers — a landmark they
  // expose as misplaced (see `AnalysisCaveat`) — marked with the same †/‡ the
  // table rows carry (see `caveatMarkers`), so a reader who has only the
  // spreadsheet can still find which rows it is about.
  caveats.forEach((caveat, i) => {
    rows.push([`Tracing caveat (${i === 0 ? '†' : '‡'})`, caveat.text]);
  });
  if (scaleSuspectNote !== null) {
    rows.push(['Scale warning', scaleSuspectNote]);
  }
  if (linearNeedsScaleNote !== null) {
    rows.push(['Scale note', linearNeedsScaleNote]);
  }
  if (sumRoundingNote !== null) {
    rows.push(['Rounding note', sumRoundingNote]);
  }
  // A blank line so the table below starts on its own header row.
  rows.push([]);
  return rows;
};

/**
 * Flattens the categorized results into report rows (header + one row per
 * measurement) for the clipboard/CSV export actions. Values are formatted
 * exactly as displayed so the exported report matches the on-screen table.
 *
 * Two columns exist for the reader on the other end of a paste:
 *
 *  - **Norm type** — "mean ± 1 SD" or "published range", because "62.0–65.0"
 *    must not be pasted onward and read as a ± 1 SD band.
 *  - **Norms source** — whose figure this particular row is graded against.
 *    An analysis is rarely one author's: Steiner's table carries Holdaway's
 *    ratio, the dental section carries Tweed's IMPA and Downs' A-Pog reading,
 *    and a spreadsheet that flattens all of them under one heading attributes
 *    every one of them to the wrong paper.
 *
 * A third, **Caveat**, carries the same †/‡ mark the on-screen table prints
 * next to a row's symbol (see `caveatMarkers`) — Björk's NSAr and SArGo used
 * to leave the dialog starred red with no sign that either symbol was
 * discussed under the table at all.
 *
 * The neutral bucket's rows carry their **own** grading rather than the
 * group's: it is one group spanning outside-norm, within-norm and ungraded
 * rows (see `defaultInterpretAnalysis`), so the group's indication would be
 * true of only the first run of them.
 */
const buildReportRows = (
  results: Props['results'],
  landmarksBySymbol: Props['landmarksBySymbol'],
  provenance: NormsProvenance | null,
  markers: { [symbol: string]: string | undefined } = {},
): string[][] => {
  const primarySource = provenance !== null
    ? formatProvenanceSource(provenance)
    : '';
  const rows: string[][] = [[
    'Finding', 'Interpretation', 'Measurement', 'Caveat', 'Name',
    'Value', 'Norm', 'Norm type', 'Deviation', 'Severity', 'Norms source',
  ]];
  results.forEach(({ category, indication, relevantComponents }) => {
    relevantComponents.forEach((
      { symbol, value, mean, min, max, band, normSource, isTarget },
    ) => {
      const landmark = landmarksBySymbol[symbol];
      const unit = getUnitSuffix(landmark);
      const stars = getSeverityStars(value, mean, min, max, band);
      const name = landmark !== undefined ? landmark.name : undefined;
      const graded = hasNorm(mean, min, max);
      // An ungraded row must not export its group's verdict as its own:
      // Tweed's triangle-closure row (always 180°, no norm — see `NO_NORM`)
      // sits in a group whose chip may read "Outside norm", and a pasted
      // spreadsheet row saying `FMPA+IMPA+FMIA · Outside norm · 180.0°`
      // would attribute a deviation to the one row that cannot have one.
      //
      // And a graded row must not export a verdict its own value contradicts:
      // a finding's chip is resolved across the whole group, so when the
      // group's measurements split — Downs' L1-OP reads the lower incisor
      // labial off a steeply canted occlusal plane while IMPA reads the same
      // tooth lingual — the group verdict is true of at most one of them, and
      // a pasted row saying `IMPA · Labial · −7.2°` attributes to a
      // measurement the opposite of what it found. Each row therefore exports
      // its **own** landmark's reading of the group's category (the same
      // re-interpretation the report's divergence note runs), and only a row
      // whose landmark states no reading of its own inherits the group's.
      const interpretOwn = landmark !== undefined ? landmark.interpret : undefined;
      const own = typeof interpretOwn === 'function'
        ? interpretOwn(value, min, max, mean)
          .filter((r) => r.category === category)
        : [];
      // The diagnostic-triangle group's verdict is *collective* by design —
      // within Tweed's norms only when every graded angle of it is (see
      // `analyses/tweed`) — and none of its rows' landmarks emit a reading of
      // that category, so a row that inherited the group's verdict exported a
      // claim its own value contradicts: FMPA at 21.0°, inside its 20–30
      // band, exported `Outside norm` two lines above a `Mandibular rotation
      // · Normal` row for the same angle in the same file. Rows of the
      // collective group therefore export their **own** grading against their
      // own norm, exactly as the neutral bucket's rows do.
      const isCollectiveVerdict = category === 'tweedTriangle';
      const rowIndication = category === NEUTRAL_CATEGORY || isCollectiveVerdict || !graded
        ? gradeAgainstNorm(value, min, max, mean)
        : (own.length > 0 ? own[0].indication : indication);
      const borrowed = normSource;
      rows.push([
        mapCategoryToString(category) || '',
        mapIndicationToString(rowIndication) || '',
        symbol,
        markers[symbol] || '',
        name !== undefined && name !== symbol ? name : '',
        formatNumber(value) + unit,
        formatNorm(mean, min, max, band, isTarget),
        graded
          ? (isSdBand(band) ? 'mean ± 1 SD' : (isTarget ? 'published target range' : 'published range'))
          : '',
        formatDeviation(value, mean, min, max, unit, band, isTarget),
        stars > 0 ? STARS[stars] : '',
        graded ? (borrowed !== undefined ? borrowed : primarySource) : '',
      ]);
    });
  });
  return rows;
};

/**
 * The neutral bucket is emitted as **one** group whose rows carry three
 * different gradings (see `defaultInterpretAnalysis`), so the table rules a
 * sub-heading over each run of them rather than printing the same category
 * heading three times with a different chip each. Every other group is a list
 * of rows exactly as before.
 */
type ResultRow =
  CategorizedAnalysisResult<Category>['relevantComponents'][0];
type TableEntry =
  | { kind: 'rule'; key: string; label: string }
  | { kind: 'row'; key: string; component: ResultRow };

const neutralEntries = (
  category: Category, components: ResultRow[],
): TableEntry[] => {
  if (category !== NEUTRAL_CATEGORY) {
    return components.map((component) => ({
      kind: 'row' as 'row', key: component.symbol, component,
    }));
  }
  const entries: TableEntry[] = [];
  let previous: string | null = null;
  components.forEach((component) => {
    const { value, mean, min, max } = component;
    const grading = gradeAgainstNorm(value, min, max, mean) as string;
    if (grading !== previous) {
      previous = grading;
      entries.push({
        kind: 'rule',
        key: `rule/${grading}`,
        label: NEUTRAL_GRADE_LABELS[grading] || '',
      });
    }
    entries.push({ kind: 'row', key: component.symbol, component });
  });
  return entries;
};

/**
 * Symbol → footnote marker for the analysis' caveats (see `AnalysisCaveat`).
 *
 * Exported so every surface that tabulates these measurements marks the same
 * rows with the same symbol: the records dashboard's findings panel showed
 * NSAr, SArGo and ArGoMe as a film's top three findings *unmarked*, with the
 * articulare caveat printed under them — three amber starred numbers met before
 * the sentence saying they may be an artefact.
 */
export const caveatMarkers = (
  caveats: AnalysisCaveat[],
): { [symbol: string]: string | undefined } => {
  const markers: { [symbol: string]: string | undefined } = {};
  caveats.forEach((caveat, i) => {
    const marker = i === 0 ? '†' : '‡';
    caveat.symbols.forEach((symbol) => {
      markers[symbol] = marker;
    });
  });
  return markers;
};

/**
 * A finding graded from a measurement that is tabulated in this same group —
 * printed in the finding cell, under the group's own conclusion, and labelled
 * with the measurement it was read from so nothing is attributed to a row it
 * did not come from. Identical markup and wording to the printed report's
 * (see `ClinicalReport/ResultsTable`): this replaced the "see above" row that
 * the two surfaces used to lay out two different ways.
 */
const AlsoFindings = ({ also }: { also: AlsoFinding[] }) => (
  <span>
    {map(also, (f, i) => (
      <span key={i} className={classes.also_finding}>
        <span className={classes.finding_category}>
          {mapCategoryToString(f.category) || '—'}
          {/* Attribution in the heading itself, so the measurement this
              conclusion was graded from is read with its name and not mistaken
              for the row it happens to sit level with. */}
          <span className={classes.also_label}>
            {/* The break opportunity is before the dash, not after it: in a
                120px FINDING column the attribution wraps, and a dash left
                hanging at the end of the heading reads as an unfinished line. */}
            {` —\u00A0${alsoFindingLabel(f.symbols)}`}
          </span>
        </span>
        <span
          className={cx(classes.chip, {
            [classes.chip__success]: chipToneFor(f.indication) === 'success',
            [classes.chip__neutral]: chipToneFor(f.indication) === 'neutral',
            [classes.chip__warn]: chipToneFor(f.indication) === 'warn',
          })}
        >
          {mapIndicationToString(f.indication) || '—'}
        </span>
      </span>
    ))}
  </span>
);

/**
 * A group whose own tabulated rows do not all back its resolved chip (see
 * `findGroupDivergence`) — printed under that chip, in the same styled block
 * `AlsoFindings` uses for a conclusion borrowed from elsewhere, but without
 * repeating the category name: this dissent is read from the *same* category
 * as the heading directly above it, on a film where two of the category's own
 * measurements land on opposite sides of it. Downs' "Lower incisor
 * inclination" chip used to read "Labial" off a 1.91-vs-1.89-SD hair between
 * L1-OP and IMPA with nothing on screen saying the group's own rows had
 * split — the printed report already re-interprets each row this way (see
 * `buildReportRows`); this is the same fact, read for the dialog's chip.
 */
const SplitFindings = ({ divergence }: { divergence: GroupDivergence }) => (
  <span>
    {map(divergence.dissenting, (d, i) => (
      <span key={i} className={classes.also_finding}>
        <span className={classes.also_label}>
          {/* Non-breaking after "Driven by": see `alsoFindingLabel` for why —
              the same narrow column, the same reason a line must not break
              right after the word that introduces the measurement list. */}
          {`Driven by ${divergence.drivingSymbols.join(', ')} — ` +
            `${d.symbols.join(', ')} reads`}
        </span>
        <span
          className={cx(classes.chip, {
            [classes.chip__success]: chipToneFor(d.indication) === 'success',
            [classes.chip__neutral]: chipToneFor(d.indication) === 'neutral',
            [classes.chip__warn]: chipToneFor(d.indication) === 'warn',
          })}
        >
          {mapIndicationToString(d.indication) || '—'}
        </span>
      </span>
    ))}
  </span>
);

const csvEscape = (cell: string): string => (
  /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
);

/**
 * Copies plain text to the clipboard; async Clipboard API first, hidden
 * textarea + execCommand as the fallback for older engines.
 */
const copyTextToClipboard = async (text: string): Promise<boolean> => {
  const nav = navigator as Navigator & {
    clipboard?: { writeText(data: string): Promise<void> };
  };
  if (nav.clipboard !== undefined) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch (_e) {
      // Fall through to the legacy path (e.g. permission denied).
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (_e) {
    return false;
  }
};

const dialogContentStyle: React.CSSProperties = {
  maxWidth: 780,
  borderRadius: 8,
};

const dialogBodyStyle: React.CSSProperties = {
  padding: '0 24px 8px',
  // The results table carries a min-width (see `.table`, style.scss) so its
  // measurement-name column stays readable instead of wrapping one letter
  // per line on a narrow window; on a window too narrow even for that
  // minimum, this is what scrolls horizontally. Not `.table_wrap` itself —
  // see its own comment for why that specific element must stay overflow-free.
  overflowX: 'auto',
};

const dialogActionsStyle: React.CSSProperties = {
  padding: '8px 16px 16px',
};

const closeLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 600,
};

// Secondary (left-side) actions: sentence case, quieter than "Close".
const secondaryLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 500,
  fontSize: 13.5,
  color: '#52616F',
  paddingLeft: 8,
  paddingRight: 12,
};

const copiedLabelStyle: React.CSSProperties = {
  ...secondaryLabelStyle,
  color: '#2E7D32',
};

const secondaryIconStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  marginLeft: 10,
};

/**
 * The app's timepoint badge: a filled pill carrying the label's first token,
 * with the rest of a free-text label written beside it in caption type.
 *
 * One construction for one fact. This is the badge the records dashboard's
 * timeline stamp uses; the whole label set inside a single pill (what this title
 * row used to do) is the version that breaks on the labels a clinician actually
 * types — "T2 post-treatment, post-RME" filled the pill, pushed the film date
 * off the row, and read as a different kind of thing from the same timepoint on
 * the dashboard.
 */
const renderTimepointBadge = (timepoint: string) => {
  const token = getTimepointToken(timepoint);
  if (token === null) {
    return null;
  }
  const rest = timepoint.trim().slice(token.length).trim();
  return (
    <span className={classes.title_timepoint_group} title={timepoint}>
      <span className={classes.title_timepoint}>{token}</span>
      {rest !== '' ? (
        <span className={classes.title_timepoint_note}>{rest}</span>
      ) : null}
    </span>
  );
};

/**
 * The table's range rows split two ways (see `formatNorm`), and whether any
 * row is a `sum`-type landmark (see `SUM_ROUNDING_NOTE`) — computed once so
 * the dialog's legend and the clipboard/CSV export print the same footnotes
 * for the same table instead of the export silently dropping the ones the
 * dialog shows (see `buildProvenanceRows`).
 */
const computeTableFlags = (
  results: Props['results'],
  landmarksBySymbol: Props['landmarksBySymbol'],
): { hasPlainRangeRow: boolean; hasTargetRow: boolean; hasSumRow: boolean } => {
  let hasPlainRangeRow = false;
  let hasTargetRow = false;
  let hasSumRow = false;
  results.forEach(({ relevantComponents }) => {
    relevantComponents.forEach(({ symbol, mean, min, max, band, isTarget }) => {
      if (hasNorm(mean, min, max) && !isSdBand(band)) {
        if (isTarget) {
          hasTargetRow = true;
        } else {
          hasPlainRangeRow = true;
        }
      }
      const landmark = landmarksBySymbol[symbol];
      if (landmark !== undefined && landmark.type === 'sum') {
        hasSumRow = true;
      }
    });
  });
  return { hasPlainRangeRow, hasTargetRow, hasSumRow };
};

interface ViewerState {
  copied: boolean;
}

export class AnalysisResultsViewer extends React.PureComponent<Props, ViewerState> {
  state: ViewerState = { copied: false };

  private copiedTimer: number | null = null;

  componentDidUpdate(prevProps: Props) {
    // Reset the transient "Copied" confirmation whenever the dialog reopens.
    if (prevProps.open && !this.props.open && this.state.copied) {
      this.setState({ copied: false });
    }
  }

  componentWillUnmount() {
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer);
    }
  }

  render() {
    const {
      open, onRequestClose, results, analysisId, landmarksBySymbol,
      needsScaleForLinear, timepoint, captureDate, provenance,
      caveats, scaleFactor, imageWidth, imageHeight,
    } = this.props;
    // What this film's scale says it physically measures, and whether that is
    // possible: the millimetre rows of this table are all derived from that
    // number, and the records dashboard already flags it on the same film.
    const filmSize = getImpliedFilmSize(imageWidth, imageHeight, scaleFactor);
    const isScaleSuspect = filmSize !== null && !filmSize.isPlausible;
    const markers = caveatMarkers(caveats);
    const patientNote = this.getPatientNote();
    const { copied } = this.state;
    const analysisName = analysisId !== null
      ? (ANALYSIS_NAMES[analysisId] || analysisId)
      : null;
    const hasResults = results.length > 0;

    // A measurement can support more than one clinical finding (e.g. the
    // facial angle backs both "Skeletal profile" and "Chin prominence"). It is
    // tabulated once, in full, and the other findings drawn from it are named
    // in that group's finding cell — the same layout the printed report uses
    // (see `grouping.ts`).
    const groups = groupFindings(results);
    // Range rows split into two footnotes: a plain range (Björk's gonial
    // halves, Jarabak's ratio — bounds only, no figure a clinician treats
    // toward) reads differently from a target range (Tweed's FMA/IMPA/FMIA —
    // see `AnalysisComponent.isTarget`), whose deviation column is a signed
    // distance from that target rather than a distance beyond a bound. A
    // `sum`-type row (Björk's total, Tweed's triangle closure) gets its own
    // footnote: its printed figure is the full-precision total, not the sum
    // of the *rounded* figures printed for its own parts two rows up, and the
    // two can disagree by the last printed digit (see `SUM_ROUNDING_NOTE`).
    const { hasPlainRangeRow, hasTargetRow, hasSumRow } =
      computeTableFlags(results, landmarksBySymbol);

    return (
      <Dialog
        open={open}
        onRequestClose={onRequestClose}
        // A keyboard user could Tab straight through this dialog and onto
        // the toolbar buttons sitting behind it (mui 0.20's Dialog does not
        // trap focus on its own) — role/aria-modal opt this dialog into the
        // app-root focus trap (see components/DialogFocusGuard), and
        // aria-labelledby is what lets a screen reader announce which
        // dialog just opened at all, which mui's own markup never states.
        paperProps={{
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'analysis-summary-title',
        }}
        title={
          <div className={classes.title}>
            <div className={classes.title_text}>
              <div className={classes.title_row}>
                <h3 id="analysis-summary-title" className={classes.title_heading}>Analysis summary</h3>
                {analysisName !== null ? (
                  <span className={classes.title_badge}>{analysisName}</span>
                ) : null}
                {/* Which film these numbers came from — read off the record, so
                    it is absent rather than invented when unrecorded.
                    One timepoint badge across the app: the pill carries the
                    label's first token ("T2" out of "T2 post-treatment"), the
                    rest of it is written beside the pill. Set whole in the pill,
                    a free-text label pushed the film date off the title row and
                    disagreed with the records dashboard's own stamp for the same
                    timepoint. */}
                {timepoint !== null ? renderTimepointBadge(timepoint) : null}
                {formatCaptureDate(captureDate) !== null ? (
                  <span className={classes.title_filmdate}>
                    Film {formatCaptureDate(captureDate)}
                  </span>
                ) : null}
              </div>
              <span className={classes.title_caption}>
                Interpretation of the calculated cephalometric values
              </span>
            </div>
            <button
              type="button"
              className={classes.close_button}
              aria-label="Close"
              onClick={onRequestClose}
            >
              {/* mui SvgIcon pins an inline `color` from the theme, so
                  `currentColor` would not track the button — pass the hex. */}
              <IconClose color="#7B8794" style={{ width: 20, height: 20 }} />
            </button>
          </div>
        }
        actions={[
          <div key="actions" className={classes.actions}>
            <div className={classes.actions_left}>
              <span title="Copy the results table to the clipboard — paste into a spreadsheet or chart notes">
                <FlatButton
                  label={copied ? 'Copied' : 'Copy table'}
                  disabled={!hasResults}
                  icon={copied
                    ? <IconCheck color="#2E7D32" style={secondaryIconStyle} />
                    : <IconCopy color="#52616F" style={secondaryIconStyle} />}
                  labelStyle={copied ? copiedLabelStyle : secondaryLabelStyle}
                  onClick={this.handleCopyTable}
                />
              </span>
              <span title="Download the results table as a CSV report">
                <FlatButton
                  label="Export CSV"
                  disabled={!hasResults}
                  icon={<IconDownload color="#52616F" style={secondaryIconStyle} />}
                  labelStyle={secondaryLabelStyle}
                  onClick={this.handleExportCsv}
                />
              </span>
            </div>
            <FlatButton
              primary
              label="Close"
              labelStyle={closeLabelStyle}
              onClick={onRequestClose}
            />
          </div>,
        ]}
        contentStyle={dialogContentStyle}
        bodyStyle={dialogBodyStyle}
        actionsContainerStyle={dialogActionsStyle}
        autoScrollBodyContent
      >
        {hasResults ? (
          <div>
            <div className={classes.table_wrap}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th className={classes.col_finding}>Finding</th>
                    <th>Measurement</th>
                    <th className={cx(classes.col_numeric, classes.col_value)}>Value</th>
                    <th className={cx(classes.col_numeric, classes.col_norm)}>Norm</th>
                    <th className={cx(classes.col_numeric, classes.col_deviation)}>
                      Deviation
                    </th>
                  </tr>
                </thead>
                {map(groups, ({ category, indication, components, also }) => {
                  const chipClass = cx(classes.chip, {
                    [classes.chip__success]: chipToneFor(indication) === 'success',
                    [classes.chip__neutral]: chipToneFor(indication) === 'neutral',
                    [classes.chip__warn]: chipToneFor(indication) === 'warn',
                  });
                  const isNeutral = category === NEUTRAL_CATEGORY;
                  // The neutral bucket is not a finding (see `NEUTRAL_CATEGORY`)
                  // and has no chip to contradict, so it is never checked for a
                  // split — only a category whose own rows can disagree with the
                  // resolved conclusion printed for them.
                  const divergence = isNeutral
                    ? null
                    : findGroupDivergence(category, indication, components, landmarksBySymbol);
                  const entries = neutralEntries(category, components);
                  return (
                    <tbody key={`${category}/${indication}`} className={classes.group}>
                      {map(entries, (entry, i) => {
                        // The heading spans the group, sub-rules included. The
                        // neutral bucket carries no chip: it holds rows with
                        // three different gradings and the rules below say
                        // which is which, row by row.
                        const findingCell = i === 0 ? (
                          <td
                            rowSpan={entries.length}
                            className={classes.cell_finding}
                          >
                            <span className={classes.finding_category}>
                              {mapCategoryToString(category) || '—'}
                            </span>
                            {isNeutral ? null : (
                              <span className={chipClass}>
                                {mapIndicationToString(indication) || '—'}
                              </span>
                            )}
                            {also.length > 0 ? (
                              <AlsoFindings also={also} />
                            ) : null}
                            {divergence !== null ? (
                              <SplitFindings divergence={divergence} />
                            ) : null}
                          </td>
                        ) : null;
                        if (entry.kind === 'rule') {
                          return (
                            <tr key={entry.key} className={classes.subrule_row}>
                              {findingCell}
                              <td colSpan={4} className={classes.subrule}>
                                {entry.label}
                              </td>
                            </tr>
                          );
                        }
                        const component = entry.component;
                        const {
                          symbol, value, mean, min, max, band, isTarget,
                        } = component;
                        const landmark = landmarksBySymbol[symbol];
                        const unit = getUnitSuffix(landmark);
                        const stars = getSeverityStars(value, mean, min, max, band);
                        const graded = hasNorm(mean, min, max);
                        const outOfRange =
                          graded && !isSdBand(band) && rangeExcess(value, min, max) !== 0;
                        const name = landmark !== undefined ? landmark.name : undefined;
                        const marker = markers[symbol];
                        const symbolCell = (
                          <td className={classes.cell_measurement}>
                            <span className={classes.measurement_symbol}>
                              {symbol}
                              {marker !== undefined ? (
                                <span
                                  className={classes.cell_caveat_mark}
                                  title="See the note under the table"
                                >
                                  {marker}
                                </span>
                              ) : null}
                            </span>
                            {name !== undefined && name !== symbol ? (
                              <span className={classes.measurement_name} title={name}>
                                {name}
                              </span>
                            ) : null}
                          </td>
                        );
                        return (
                          <tr key={entry.key}>
                            {findingCell}
                            {symbolCell}
                            <td
                              className={cx(classes.cell_numeric, classes.cell_value, {
                                [classes.cell_value__warn]: stars === 1 || outOfRange,
                                [classes.cell_value__error]: stars >= 2,
                              })}
                            >
                              {displayNumber(value)}{unit}
                            </td>
                            <td
                              className={cx(classes.cell_numeric, classes.cell_norm)}
                              title={!graded
                                ? 'Measured value — this app states no published norm for it'
                                : isSdBand(band)
                                  ? `Mean ± 1 SD (${displayNumber(min)} to ${displayNumber(max)}${unit})`
                                  : isTarget
                                    ? 'Published target, with the conventional clinical ' +
                                      'latitude range around it — no standard deviation stated'
                                    : `Published normal range, no standard deviation stated`}
                            >
                              {/* A target's main line is the target alone (its
                                  range travels on its own line below, see
                                  `.norm_target_bounds`) — `displayNorm` still
                                  carries the combined "25.0 · range 20–30"
                                  text for the flat-text CSV/copy export (see
                                  `buildReportRows`), where there is no second
                                  line to put it on. */}
                              {isTarget ? displayNumber(mean) : displayNorm(mean, min, max, band)}
                              {graded && !isSdBand(band) ? (
                                <span className={classes.norm_kind}>
                                  {isTarget ? 'target' : 'range'}
                                </span>
                              ) : null}
                              {isTarget ? (
                                <span className={classes.norm_target_bounds}>
                                  {displayMinus(formatRange(min, max))}
                                </span>
                              ) : null}
                            </td>
                            <td
                              className={cx(classes.cell_numeric, classes.cell_deviation, {
                                [classes.cell_deviation__warn]: stars === 1 || outOfRange,
                                [classes.cell_deviation__error]: stars >= 2,
                                [classes.cell_deviation__muted]:
                                  graded && !isSdBand(band) && !outOfRange && !isTarget,
                              })}
                            >
                              {displayDeviation(value, mean, min, max, unit, band, isTarget)}
                              {/* The slot is always rendered so the numbers stay
                                  aligned whether or not a row carries markers. */}
                              <span className={classes.deviation_stars}>
                                {stars > 0 ? STARS[stars] : ''}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
            <div className={classes.legend}>
              Deviation from norm:{' '}
              <span className={classes.legend_stars}>*</span> over 1 SD
              <span className={classes.legend_dot}>·</span>
              <span className={classes.legend_stars}>**</span> over 2 SD
              <span className={classes.legend_dot}>·</span>
              <span className={classes.legend_stars}>***</span> over 3 SD
              {hasPlainRangeRow ? (
                // Says out loud which rows the star scale does *not* apply to,
                // so "62.0–65.0 · +0.5 %" is never read as half an SD.
                <span className={classes.legend_note_quiet}>
                  Rows marked <em>range</em> carry a published normal range, not a
                  mean ± SD: their author stated no standard deviation, so they
                  are graded in or out of range and carry no stars. Their
                  deviation is the distance beyond the nearer bound.
                </span>
              ) : null}
              {hasTargetRow ? (
                // The target-range sibling of the note above: these rows *do*
                // have a figure to read a distance from — the author's stated
                // target, not either bound — so the wording must not tell the
                // reader the opposite of what the deviation column shows them.
                <span className={classes.legend_note_quiet}>
                  Rows marked <em>target</em> carry a published target with a
                  conventional clinical latitude range around it, not a mean ±
                  SD, and carry no stars. Their norm cell shows the target beside
                  the range, and their deviation is the signed distance from
                  that target, not from the nearer bound.
                </span>
              ) : null}
              {hasSumRow ? (
                <span className={classes.legend_note_quiet}>
                  {SUM_ROUNDING_NOTE}
                </span>
              ) : null}
              {/* What the analysis' own numbers say about the *tracing* — a
                  landmark they expose as misplaced. Printed before the
                  housekeeping notes: it can invalidate the rows it marks. */}
              {map(caveats, (caveat, i) => (
                <span key={i} className={classes.legend_caveat}>
                  <span className={classes.legend_caveat_mark}>
                    {i === 0 ? '†' : '‡'}
                  </span>
                  {caveat.text}
                </span>
              ))}
              {isScaleSuspect && filmSize !== null ? (
                // The mm rows above are present but derived from a scale that
                // cannot be right — stated here rather than left for the reader
                // to discover on the records dashboard.
                <span className={classes.legend_note}>
                  {formatScaleSuspectNote(filmSize)}
                </span>
              ) : null}
              {needsScaleForLinear ? (
                // The mm measurements of this analysis are missing above, not
                // normal — account for them instead of leaving a silent gap.
                <span className={classes.legend_note}>
                  {LINEAR_NEEDS_SCALE_NOTE}
                </span>
              ) : null}
            </div>
            {/* Whose norms these are. Quiet, but present on every table the
                app shows: the deviation column is meaningless without it. */}
            {provenance !== null ? (
              <div className={classes.provenance}>
                <span className={classes.provenance_label}>Norms</span>
                <span className={classes.provenance_body}>
                  <span className={classes.provenance_source}>
                    {formatProvenanceSource(provenance)}
                  </span>
                  {provenance.alsoFrom !== undefined
                    && provenance.alsoFrom.length > 0 ? (
                    <span className={classes.provenance_also}>
                      Also: {provenance.alsoFrom.join('; ')}
                    </span>
                  ) : null}
                  {provenance.note !== undefined ? (
                    <span className={classes.provenance_note}>
                      {provenance.note}
                    </span>
                  ) : null}
                  {/* What this reading did with this patient's record: an
                      author's age correction or sex split applied, or the
                      reason it was not. */}
                  {patientNote !== undefined ? (
                    <span className={classes.provenance_applied}>
                      {patientNote}
                    </span>
                  ) : null}
                  <span className={classes.provenance_caveat}>
                    {NORMS_NOT_MATCHED}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={classes.empty}>
            <span className={classes.empty_headline}>No results to summarize yet</span>
            <span className={classes.empty_hint}>
              Place the required landmarks or run Auto-plot to calculate the analysis.
            </span>
          </div>
        )}
      </Dialog>
    );
  }

  /**
   * Every symbol this reading actually tabulated — across every group, not
   * just the one a caller happens to be looking at — so a `patientNote` that
   * describes a specific row (Jacobson's Wits appraisal, absent from the
   * table on an uncalibrated film) can tell whether that row is above it
   * before it says so. See `NormsProvenance.patientNote`.
   */
  private getComputedSymbols = (): Set<string> => {
    const { results } = this.props;
    const symbols = new Set<string>();
    results.forEach(({ relevantComponents }) => {
      relevantComponents.forEach(({ symbol }) => symbols.add(symbol));
    });
    return symbols;
  };

  /** The patient-applied norms note, as shown in the provenance block. */
  private getPatientNote = (): string | undefined => {
    const { provenance, analysisContext } = this.props;
    return provenance !== null && typeof provenance.patientNote === 'function'
      ? provenance.patientNote(analysisContext, this.getComputedSymbols())
      : undefined;
  };

  /**
   * The scale-derived warnings printed under the table (see `render`), as
   * plain strings for the clipboard/CSV export — `null` when the film's
   * calibration gives no reason to print either.
   */
  private getScaleNotes = (): {
    scaleSuspectNote: string | null;
    linearNeedsScaleNote: string | null;
  } => {
    const {
      needsScaleForLinear, scaleFactor, imageWidth, imageHeight,
    } = this.props;
    const filmSize = getImpliedFilmSize(imageWidth, imageHeight, scaleFactor);
    const isScaleSuspect = filmSize !== null && !filmSize.isPlausible;
    return {
      scaleSuspectNote: isScaleSuspect && filmSize !== null
        ? formatScaleSuspectNote(filmSize)
        : null,
      linearNeedsScaleNote: needsScaleForLinear ? LINEAR_NEEDS_SCALE_NOTE : null,
    };
  };

  private handleCopyTable = () => {
    const { results, landmarksBySymbol, caveats } = this.props;
    const { provenance, captureDate, timepoint, analysisId } = this.props;
    const { scaleSuspectNote, linearNeedsScaleNote } = this.getScaleNotes();
    const { hasSumRow } = computeTableFlags(results, landmarksBySymbol);
    const text = [
      ...buildProvenanceRows(
        analysisId, provenance, captureDate, timepoint, this.getPatientNote(),
        caveats, scaleSuspectNote, linearNeedsScaleNote,
        hasSumRow ? SUM_ROUNDING_NOTE : null,
      ),
      ...buildReportRows(
        results, landmarksBySymbol, provenance, caveatMarkers(caveats),
      ),
    ]
      .map((cells) => cells.join('\t'))
      .join('\n');
    copyTextToClipboard(text).then((ok) => {
      if (ok) {
        this.setState({ copied: true });
        if (this.copiedTimer !== null) {
          window.clearTimeout(this.copiedTimer);
        }
        this.copiedTimer = window.setTimeout(
          () => this.setState({ copied: false }),
          2500,
        );
      }
    });
  };

  private handleExportCsv = () => {
    const {
      results, landmarksBySymbol, analysisId, provenance, captureDate,
      timepoint, caveats,
    } = this.props;
    const { scaleSuspectNote, linearNeedsScaleNote } = this.getScaleNotes();
    const { hasSumRow } = computeTableFlags(results, landmarksBySymbol);
    const rows = [
      ...buildProvenanceRows(
        analysisId, provenance, captureDate, timepoint, this.getPatientNote(),
        caveats, scaleSuspectNote, linearNeedsScaleNote,
        hasSumRow ? SUM_ROUNDING_NOTE : null,
      ),
      ...buildReportRows(
        results, landmarksBySymbol, provenance, caveatMarkers(caveats),
      ),
    ];
    // Exactly one BOM: this download no longer goes through file-saver's
    // saveAs() (see saveBlobAs's doc comment in tracingSnapshot.ts \u2014 a
    // webpack chunk boundary between file-saver and its caller silently
    // drops the filename), and a plain anchor download adds no BOM of its
    // own, so it must be prepended here now that nothing else will. Exactly
    // one: a second U+FEFF welded on top of this one would survive as an
    // invisible character inside cell A1 ("\uFEFFAnalysis") \u2014 Excel's
    // BOM-stripping only ever eats the outer one \u2014 which silently fails an
    // exact-match or VLOOKUP on the header row.
    const csv = rows.map(
      (cells) => cells.map(csvEscape).join(','),
    ).join('\r\n');
    const stem = analysisId !== null ? `${analysisId}-analysis` : 'analysis';
    saveBlobAs(
      new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
      `${stem}-summary.csv`,
    );
  };
}

export default AnalysisResultsViewer;
