import React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import IconClose from 'material-ui/svg-icons/navigation/close';
import IconCopy from 'material-ui/svg-icons/content/content-copy';
import IconCheck from 'material-ui/svg-icons/navigation/check';
import IconDownload from 'material-ui/svg-icons/file/file-download';

import { saveAs } from 'file-saver';

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
 */
export const formatNorm = (
  mean: number, min: number, max: number, band?: NormBand,
): string => {
  if (!hasNorm(mean, min, max)) {
    return NO_NORM_TEXT;
  }
  if (!isSdBand(band)) {
    return formatRange(min, max);
  }
  return `${formatNumber(mean)} ± ${formatNumber((max - min) / 2)}`;
};

/** What a range component's deviation column says while the value is inside. */
export const IN_RANGE_TEXT = 'in range';

/**
 * The deviation cell's text. An SD component reports its signed distance from
 * the mean; a range component reports how far it lies beyond the nearer bound
 * (and says "in range" while it lies between them), because a range has no
 * mean to subtract from.
 */
export const formatDeviation = (
  value: number, mean: number, min: number, max: number,
  unit: string, band?: NormBand,
): string => {
  if (!hasNorm(mean, min, max)) {
    return NO_NORM_TEXT;
  }
  if (!isSdBand(band)) {
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
  mean: number, min: number, max: number, band?: NormBand,
): string => displayMinus(formatNorm(mean, min, max, band));

/** `formatDeviation` with the display minus (see `displayMinus`). */
export const displayDeviation = (
  value: number, mean: number, min: number, max: number,
  unit: string, band?: NormBand,
): string => displayMinus(formatDeviation(value, mean, min, max, unit, band));

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
 */
const buildProvenanceRows = (
  analysisId: string | null,
  provenance: NormsProvenance | null,
  captureDate: string | null,
  timepoint: string | null,
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
  }
  rows.push(['Caveat', NORMS_NOT_MATCHED]);
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
 * The neutral bucket's rows carry their **own** grading rather than the
 * group's: it is one group spanning outside-norm, within-norm and ungraded
 * rows (see `defaultInterpretAnalysis`), so the group's indication would be
 * true of only the first run of them.
 */
const buildReportRows = (
  results: Props['results'],
  landmarksBySymbol: Props['landmarksBySymbol'],
  provenance: NormsProvenance | null,
): string[][] => {
  const primarySource = provenance !== null
    ? formatProvenanceSource(provenance)
    : '';
  const rows: string[][] = [[
    'Finding', 'Interpretation', 'Measurement', 'Name',
    'Value', 'Norm', 'Norm type', 'Deviation', 'Severity', 'Norms source',
  ]];
  results.forEach(({ category, indication, relevantComponents }) => {
    relevantComponents.forEach((
      { symbol, value, mean, min, max, band, normSource },
    ) => {
      const landmark = landmarksBySymbol[symbol];
      const unit = getUnitSuffix(landmark);
      const stars = getSeverityStars(value, mean, min, max, band);
      const name = landmark !== undefined ? landmark.name : undefined;
      const graded = hasNorm(mean, min, max);
      const rowIndication = category === NEUTRAL_CATEGORY
        ? gradeAgainstNorm(value, min, max, mean)
        : indication;
      const borrowed = normSource;
      rows.push([
        mapCategoryToString(category) || '',
        mapIndicationToString(rowIndication) || '',
        symbol,
        name !== undefined && name !== symbol ? name : '',
        formatNumber(value) + unit,
        formatNorm(mean, min, max, band),
        graded ? (isSdBand(band) ? 'mean ± 1 SD' : 'published range') : '',
        formatDeviation(value, mean, min, max, unit, band),
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
      caveats, analysisContext, scaleFactor, imageWidth, imageHeight,
    } = this.props;
    // What this film's scale says it physically measures, and whether that is
    // possible: the millimetre rows of this table are all derived from that
    // number, and the records dashboard already flags it on the same film.
    const filmSize = getImpliedFilmSize(imageWidth, imageHeight, scaleFactor);
    const isScaleSuspect = filmSize !== null && !filmSize.isPlausible;
    const markers = caveatMarkers(caveats);
    const patientNote =
      provenance !== null && typeof provenance.patientNote === 'function'
        ? provenance.patientNote(analysisContext)
        : undefined;
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
    let hasRangeRow = false;
    results.forEach(({ relevantComponents }) => {
      relevantComponents.forEach(({ mean, min, max, band }) => {
        if (hasNorm(mean, min, max) && !isSdBand(band)) {
          hasRangeRow = true;
        }
      });
    });

    return (
      <Dialog
        open={open}
        onRequestClose={onRequestClose}
        title={
          <div className={classes.title}>
            <div className={classes.title_text}>
              <div className={classes.title_row}>
                <h3 className={classes.title_heading}>Analysis summary</h3>
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
                        const { symbol, value, mean, min, max, band } = component;
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
                                  : `Published normal range, no standard deviation stated`}
                            >
                              {displayNorm(mean, min, max, band)}
                              {graded && !isSdBand(band) ? (
                                <span className={classes.norm_kind}>range</span>
                              ) : null}
                            </td>
                            <td
                              className={cx(classes.cell_numeric, classes.cell_deviation, {
                                [classes.cell_deviation__warn]: stars === 1 || outOfRange,
                                [classes.cell_deviation__error]: stars >= 2,
                                [classes.cell_deviation__muted]:
                                  graded && !isSdBand(band) && !outOfRange,
                              })}
                            >
                              {displayDeviation(value, mean, min, max, unit, band)}
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
              {hasRangeRow ? (
                // Says out loud which rows the star scale does *not* apply to,
                // so "62.0–65.0 · +0.5 %" is never read as half an SD.
                <span className={classes.legend_note_quiet}>
                  Rows marked <em>range</em> carry a published normal range, not a
                  mean ± SD: their author stated no standard deviation, so they
                  are graded in or out of range and carry no stars. Their
                  deviation is the distance beyond the nearer bound.
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
                  The image scale makes this film {filmSize.label} — outside the
                  {' '}{FILM_SIZE_BAND.minMm}–{FILM_SIZE_BAND.maxMm} mm a
                  cephalogram measures. Every millimetre value above is derived
                  from that scale and is wrong by the same factor if it is; angles
                  and ratios are unaffected. Re-calibrate from the ruler chip in
                  the toolbar.
                </span>
              ) : null}
              {needsScaleForLinear ? (
                // The mm measurements of this analysis are missing above, not
                // normal — account for them instead of leaving a silent gap.
                <span className={classes.legend_note}>
                  Linear measurements need an image scale — set it from the
                  calibration chip in the toolbar. Angular values are unaffected.
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

  private handleCopyTable = () => {
    const { results, landmarksBySymbol } = this.props;
    const { provenance, captureDate, timepoint, analysisId } = this.props;
    const text = [
      ...buildProvenanceRows(analysisId, provenance, captureDate, timepoint),
      ...buildReportRows(results, landmarksBySymbol, provenance),
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
      timepoint,
    } = this.props;
    const rows = [
      ...buildProvenanceRows(analysisId, provenance, captureDate, timepoint),
      ...buildReportRows(results, landmarksBySymbol, provenance),
    ];
    // BOM so Excel opens the °/± characters as UTF-8.
    const csv = '\uFEFF' + rows.map(
      (cells) => cells.map(csvEscape).join(','),
    ).join('\r\n');
    const stem = analysisId !== null ? `${analysisId}-analysis` : 'analysis';
    saveAs(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `${stem}-summary.csv`,
    );
  };
}

export default AnalysisResultsViewer;
