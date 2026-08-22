import * as React from 'react';

import * as cx from 'classnames';

import map from 'lodash/map';

// The report must match the Summary dialog's conventions exactly (formatting,
// units, severity stars), so it reuses that component's exported helpers.
import {
  getUnitSuffix,
  getSeverityStars,
  chipToneFor,
  STARS,
  formatRange,
  displayMinus,
  SUM_ROUNDING_NOTE,
} from 'components/AnalysisResultsViewer';
import {
  hasNorm, isSdBand, rangeExcess,
  gradeAgainstNorm, NEUTRAL_CATEGORY, NEUTRAL_GRADE_LABELS,
} from 'analyses/helpers';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';
// One measurement, one row — shared with the Summary dialog so the same
// tracing is typeset the same way on screen and on paper.
import {
  groupFindings, alsoFindingLabel, AlsoFinding,
} from 'components/AnalysisResultsViewer/grouping';

import {
  missingLandmarksNote, printNumber, printNorm, printDeviation,
} from './copy';

const classes = require('./style.scss');

export interface ResultsTableProps {
  /** Categorized results of one analysis. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions keyed by symbol, for names and units. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /**
   * Display name of the analysis these rows belong to. Printed in the table's
   * repeated header as "<name> analysis, continued", so a page that starts in
   * the middle of this table says which analysis' findings it is continuing.
   * See `ContinuationMask` for how the first page is kept from claiming it.
   */
  analysisName?: string;
  /**
   * True when the analysis interprets linear (mm) measurements that were
   * suppressed for want of an image scale. Their rows are absent from the
   * printed table, so a footnote accounts for them on the record.
   */
  needsScaleForLinear: boolean;
  /**
   * How many of the analysis' measurements could not be computed because the
   * landmarks they are built from are not all placed. Accounted for in the
   * legend rather than left as blanks or zeros.
   */
  missingLandmarkCount?: number;
  /** Symbols of the landmarks still to be plotted, named in that footnote. */
  missingSymbols?: string[];
  /**
   * Whether to print the star key under the table. The combined report prints
   * it once in its front matter instead of under each of its sections; the
   * footnotes above (which are specific to *this* analysis) always print.
   */
  showKey?: boolean;
  /**
   * Warnings the analysis draws from its own numbers (see `AnalysisCaveat`).
   * The rows they name are marked †; the text prints under the table.
   */
  caveats?: AnalysisCaveat[];
}

const NO_SYMBOLS: string[] = [];
const NO_CAVEATS: AnalysisCaveat[] = [];

/**
 * Which rows each caveat is about, as a symbol → marker lookup. A caveat is
 * printed under the table but marked *on* the rows, so a reader who scans the
 * numbers and never reaches the footnote still sees that three of them are
 * being questioned.
 */
const caveatMarkers = (
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
 * Whether this table carries a `sum`-type row (Björk's total, Tweed's
 * triangle closure) — the same test `computeTableFlags` in
 * `AnalysisResultsViewer` runs to decide whether the Summary dialog's legend
 * and its clipboard/CSV export print `SUM_ROUNDING_NOTE`. Kept local rather
 * than importing that (unexported) helper, but checking the identical
 * condition, so the printed report foots the same tables the dialog does —
 * see `SUM_ROUNDING_NOTE`'s own doc comment for why the printed total can be
 * 0.1° off a hand-addition of the rounded parts above it.
 */
const hasSumRow = (
  results: ResultsTableProps['results'],
  landmarksBySymbol: ResultsTableProps['landmarksBySymbol'],
): boolean => results.some(({ relevantComponents }) => relevantComponents.some(
  ({ symbol }) => {
    const landmark = landmarksBySymbol[symbol];
    return landmark !== undefined && landmark.type === 'sum';
  },
));

/** The star key, printed once per document (see `showKey`). */
export const DeviationKey = () => (
  <span>
    Deviation from norm:{' '}
    <span className={classes.legend_stars}>*</span> over 1 SD
    <span className={classes.legend_dot}>·</span>
    <span className={classes.legend_stars}>**</span> over 2 SD
    <span className={classes.legend_dot}>·</span>
    <span className={classes.legend_stars}>***</span> over 3 SD
    <span className={classes.legend_dot}>·</span>
    a norm printed as a range (e.g. 62.0–65.0) is the author's published range,
    not a mean ± SD, and carries no stars
  </span>
);

/**
 * Blanks the table's "…, continued" line on the page the table *starts* on.
 *
 * `thead { display: table-header-group }` is the only thing that repeats a
 * header across the pages a long table spills onto, and it repeats it
 * identically — CSS cannot word the first occurrence differently. But an
 * absolutely positioned box whose containing block is the fragmented table
 * wrapper is painted only on the fragment the wrapper *begins* on (verified in
 * Chromium's print pipeline), so a white patch of the continuation line's exact
 * height covers it on the opening page and on no other. The line is print-only,
 * and the height is fixed in CSS on both this patch and the row it hides
 * (see `.cont_row`, `.cont_mask`) so the two can never drift apart.
 *
 * Nothing clinical is hidden this way: the patch covers one word of running
 * furniture, never a measurement.
 */
const ContinuationMask = () => (
  <span className={classes.cont_mask} aria-hidden="true" />
);

/**
 * Chip classes for a finding, by **indication**.
 *
 * Deliberately not by the worst severity in the group: that put "Growth
 * pattern — Horizontal" in amber under Björk and in red under Jarabak on the
 * same printed page, identical wording from an identical tracing, because
 * Björk's group happened to contain a more deviant member. Severity is carried
 * per row, on the value and deviation of the measurement that actually earned
 * it.
 */
const chipClassFor = (indication: Indication<Category>): string => {
  const tone = chipToneFor(indication);
  return cx(classes.chip, {
    [classes.chip__success]: tone === 'success',
    [classes.chip__neutral]: tone === 'neutral',
    [classes.chip__warn]: tone === 'warn',
  });
};

/**
 * A finding graded from a measurement that is tabulated in this same group —
 * printed in the finding cell, under the group's own conclusion, and labelled
 * with the measurement it was read from so nothing is attributed to a row it
 * did not come from. See `grouping.ts`: this is what replaced the "see above"
 * row that used to print a value with no norm.
 */
const AlsoFindings = ({ also }: { also: AlsoFinding[] }) => (
  <span>
    {map(also, (f, i) => (
      <span key={i} className={classes.also_finding}>
        <span className={classes.finding_category}>
          {mapCategoryToString(f.category) || '—'}
          {/* Attribution in the heading itself: on paper this block sat level
              with the next measurement's row, and a 9px caption above an 11px
              bold heading was the only thing saying it was not that row's
              conclusion. */}
          <span className={classes.also_label}>
            {/* The break opportunity is before the dash, not after it: in a
                120px FINDING column the attribution wraps, and a dash left
                hanging at the end of the heading reads as an unfinished line. */}
            {` \u2014\u00A0${alsoFindingLabel(f.symbols)}`}
          </span>
        </span>
        <span className={chipClassFor(f.indication)}>
          {mapIndicationToString(f.indication) || '—'}
        </span>
      </span>
    ))}
  </span>
);

/**
 * The printed results table: one row per measurement, grouped by clinical
 * finding, with value, norm (a mean ± SD or the author's published range)
 * and the signed deviation carrying the
 * one-to-three-star severity convention. Used both by the single-analysis
 * report and by every section of the combined ("All analyses") report.
 */
/**
 * A group's rows, with a sub-heading before each run of neutral measurements
 * that share a grading. The neutral bucket is one group with one heading (see
 * `defaultInterpretAnalysis`); these rules are what keeps the row-level truth —
 * outside the norm, within it, or reported without one — visible under it.
 */
type Row = CategorizedAnalysisResult<Category>['relevantComponents'][0];
type Entry =
  | { kind: 'rule'; key: string; label: string }
  | { kind: 'row'; key: string; component: Row };

const entriesFor = (
  category: Category, components: Row[],
): Entry[] => {
  if (category !== NEUTRAL_CATEGORY) {
    return components.map((component) => ({
      kind: 'row' as 'row', key: component.symbol, component,
    }));
  }
  const entries: Entry[] = [];
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
 * Splits the neutral bucket's entries at each subheading, so print can move
 * one run to the next page without dragging every other run of "Measured
 * values" with it (see the `<tbody>` comment below, and `.subrule_row` in
 * style.scss: Chromium's table fragmenter will not split a `<tbody>` whose
 * `rowSpan`'d finding cell reaches every row in it, confirmed directly against
 * this build's own print pipeline — CSS `page-break-inside: auto` on the
 * `<tbody>` does not change that). `entriesFor` above always opens the neutral
 * bucket with a `rule` entry (its `previous` grading starts `null`, which
 * never equals a real grading), so every run here is non-empty.
 */
const runsFor = (entries: Entry[]): Entry[][] => {
  const runs: Entry[][] = [];
  entries.forEach((entry) => {
    if (entry.kind === 'rule' || runs.length === 0) {
      runs.push([entry]);
    } else {
      runs[runs.length - 1].push(entry);
    }
  });
  return runs;
};

const ResultsTable = (props: ResultsTableProps) => {
  const {
    results, landmarksBySymbol, needsScaleForLinear, analysisName,
    missingLandmarkCount = 0, missingSymbols = NO_SYMBOLS,
    showKey = true, caveats = NO_CAVEATS,
  } = props;

  // Same de-duplication as the Summary dialog (see `grouping.ts`): a
  // measurement shared by several findings is tabulated once, in full, and the
  // other findings drawn from it are named in that group's finding cell.
  const groups = groupFindings(results);
  const markers = caveatMarkers(caveats);
  const sumRow = hasSumRow(results, landmarksBySymbol);

  const notes = (
    <div className={classes.legend}>
      {showKey ? <DeviationKey /> : null}
      {sumRow ? (
        // Explains, once, why a printed sum row (Björk's total, Tweed's
        // triangle closure) can read up to 0.1° off a hand-addition of the
        // rounded parts printed above it — without this the discrepancy on
        // page 7's Björk section reads as an arithmetic error rather than the
        // full-precision-vs-rounded-parts artifact it is (see `hasSumRow`).
        <span className={classes.legend_note}>
          {SUM_ROUNDING_NOTE}
        </span>
      ) : null}
      {/* What the analysis' own numbers say about the tracing. Printed above
          the housekeeping footnotes: it can invalidate the rows it names. */}
      {map(caveats, (caveat, i) => (
        <span key={i} className={classes.legend_caveat}>
          <span className={classes.legend_caveat_mark}>
            {i === 0 ? '†' : '‡'}
          </span>
          {caveat.text}
        </span>
      ))}
      {missingLandmarkCount > 0 ? (
        // Measurements the geometry cannot produce yet. Naming the count is
        // the honest alternative to printing blanks (or zeros) for them.
        <span className={classes.legend_note}>
          {missingLandmarksNote(missingLandmarkCount, missingSymbols)}
        </span>
      ) : null}
      {needsScaleForLinear ? (
        // The analysis' millimetre measurements are absent from the table
        // above; the record has to say so rather than imply they were within
        // norm. Kept to one short line: the reason, and what to do about it,
        // are stated once for the whole document in the banner under the
        // patient block (see ClinicalReport/index.tsx#scaleBanner). Fourteen
        // copies of that paragraph taught the reader to skip it.
        <span className={classes.legend_note}>
          Linear (mm) measurements omitted — no image scale (see above).
        </span>
      ) : null}
    </div>
  );

  // An analysis that interprets a single measurement gets the same table as
  // one that interprets sixteen. It used to get a "highlight card" with the
  // deviation written out in prose, which meant one section of a printed
  // report presented its number in a layout no other section used — the reader
  // had to re-learn where to look for the value, the norm and the deviation.
  // (The wigglegram is suppressed below two measurements on its own: a
  // one-point profile is not a profile.)
  return (
    <div className={classes.table_wrap}>
      {analysisName !== undefined ? <ContinuationMask /> : null}
      <table className={classes.table}>
        <thead>
          {/* Repeated by `display: table-header-group` on every page this table
              spills onto: a finding group orphaned at the top of page 5 is
              otherwise unattributable to any analysis. Blanked on the page the
              table starts on, where the section heading above already names the
              analysis — see `ContinuationMask`. */}
          {analysisName !== undefined ? (
            <tr className={classes.cont_row}>
              <th colSpan={5} className={classes.cont_cell}>
                {analysisName} analysis, continued
              </th>
            </tr>
          ) : null}
          <tr>
            <th className={classes.col_finding}>
              Finding
            </th>
            <th>Measurement</th>
            <th className={classes.col_numeric}>Value</th>
            <th className={classes.col_numeric}>Norm</th>
            <th className={classes.col_numeric}>Deviation</th>
          </tr>
        </thead>
        {map(groups, ({ category, indication, components, also }) => {
          const chipClass = chipClassFor(indication);
          const isNeutral = category === NEUTRAL_CATEGORY;
          const entries = entriesFor(category, components);
          // One `<tbody>` for the whole group ordinarily — but the neutral
          // bucket splits at each of its own subheadings (`runsFor`), because
          // Chromium will not fragment a `<tbody>` whose finding cell
          // `rowSpan`s every row in it (see the comment on `runsFor` and
          // `.subrule_row` in style.scss). A non-neutral group is always a
          // single run: `runsFor` is never called on it.
          const runs = isNeutral ? runsFor(entries) : [entries];
          return map(runs, (runEntries, runIndex) => (
            <tbody
              key={`${category}/${indication}/${runIndex}`}
              className={classes.group}
            >
              {map(runEntries, (entry, i) => {
                // The heading cell spans its own run, sub-rule included — the
                // whole group, pre-split. The category label and chip print
                // only on the group's first run: a reader who turns the page
                // mid-bucket reads the next run's own subheading instead,
                // never a second "Measured values" purporting to be a new
                // finding. The neutral bucket carries no chip regardless: its
                // rows are graded one by one under the rules below, and a
                // single chip over them would have to be untrue of most.
                const findingCell = i === 0 ? (
                  <td rowSpan={runEntries.length} className={classes.cell_finding}>
                    {runIndex === 0 ? (
                      <>
                        <span className={classes.finding_category}>
                          {mapCategoryToString(category) || '—'}
                        </span>
                        {isNeutral ? null : (
                          <span className={chipClass}>
                            {mapIndicationToString(indication) || '—'}
                          </span>
                        )}
                        {also.length > 0 ? <AlsoFindings also={also} /> : null}
                      </>
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
                const {
                  symbol, value, mean, min, max, band, isTarget,
                } = entry.component;
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
                          title="See the note under this table"
                        >
                          {marker}
                        </span>
                      ) : null}
                    </span>
                    {name !== undefined && name !== symbol ? (
                      <span className={classes.measurement_name}>
                        {name}
                      </span>
                    ) : null}
                  </td>
                );
                const valueCell = (
                  <td
                    className={cx(classes.cell_numeric, classes.cell_value, {
                      [classes.cell_value__warn]: stars === 1 || outOfRange,
                      [classes.cell_value__error]: stars >= 2,
                    })}
                  >
                    {printNumber(value)}{unit}
                  </td>
                );
                return (
                  <tr key={entry.key}>
                    {findingCell}
                    {symbolCell}
                    {valueCell}
                    <td className={cx(classes.cell_numeric, classes.cell_norm)}>
                      {/* A target's main line is the target alone (its range
                          travels on its own line below, see
                          `.norm_target_bounds`) — `printNorm` still carries
                          the combined "25.0 · range 20–30" text, kept only
                          because there is no second line to print it on
                          elsewhere it is used. Matches
                          AnalysisResultsViewer/index.tsx's on-screen table so
                          the printed sheet and the Summary dialog agree. */}
                      {isTarget ? printNumber(mean) : printNorm(mean, min, max, band)}
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
                      {printDeviation(value, mean, min, max, unit, band, isTarget)}
                      <span className={classes.deviation_stars}>
                        {stars > 0 ? STARS[stars] : ''}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ));
        })}
      </table>
      {notes}
    </div>
  );
};

export default ResultsTable;
