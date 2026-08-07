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
} from 'components/AnalysisResultsViewer';
import {
  hasNorm, isSdBand, rangeExcess,
  gradeAgainstNorm, NEUTRAL_CATEGORY, NEUTRAL_GRADE_LABELS,
} from 'analyses/helpers';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';

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
   * repeated header row, so a page that carries nothing but a continuation of
   * this table still says which analysis it continues.
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

const ResultsTable = (props: ResultsTableProps) => {
  const {
    results, landmarksBySymbol, needsScaleForLinear, analysisName,
    missingLandmarkCount = 0, missingSymbols = NO_SYMBOLS,
    showKey = true, caveats = NO_CAVEATS,
  } = props;

  // Same cross-reference logic as the Summary dialog: a measurement shared
  // by several findings is listed in full once and referenced afterwards.
  const firstCategoryOf: { [symbol: string]: Category | undefined } = {};
  results.forEach(({ category, relevantComponents }) => {
    relevantComponents.forEach(({ symbol }) => {
      if (firstCategoryOf[symbol] === undefined) {
        firstCategoryOf[symbol] = category;
      }
    });
  });
  const markers = caveatMarkers(caveats);

  const notes = (
    <div className={classes.legend}>
      {showKey ? <DeviationKey /> : null}
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
    <div>
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.col_finding}>
              Finding
              {/* Repeated by `display: table-header-group` on every page this
                  table spills onto, which is the only continuation label CSS
                  can carry: a finding group orphaned at the top of page 5 is
                  otherwise unattributable to any analysis. */}
              {analysisName !== undefined ? (
                <span className={classes.th_scope}>{analysisName}</span>
              ) : null}
            </th>
            <th>Measurement</th>
            <th className={classes.col_numeric}>Value</th>
            <th className={classes.col_numeric}>Norm</th>
            <th className={classes.col_numeric}>Deviation</th>
          </tr>
        </thead>
        {map(results, ({ category, indication, relevantComponents }) => {
          const chipClass = chipClassFor(indication);
          const isNeutral = category === NEUTRAL_CATEGORY;
          const entries = entriesFor(category, relevantComponents);
          return (
            <tbody key={`${category}/${indication}`} className={classes.group}>
              {map(entries, (entry, i) => {
                // The heading cell spans the whole group, sub-rules included.
                // The neutral bucket carries no chip: its rows are graded one
                // by one under the rules below, and a single chip over them
                // would have to be untrue of most of them.
                const findingCell = i === 0 ? (
                  <td rowSpan={entries.length} className={classes.cell_finding}>
                    <span className={classes.finding_category}>
                      {mapCategoryToString(category) || '—'}
                    </span>
                    {isNeutral ? null : (
                      <span className={chipClass}>
                        {mapIndicationToString(indication) || '—'}
                      </span>
                    )}
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
                const { symbol, value, mean, min, max, band } = entry.component;
                const landmark = landmarksBySymbol[symbol];
                const unit = getUnitSuffix(landmark);
                const stars = getSeverityStars(value, mean, min, max, band);
                const graded = hasNorm(mean, min, max);
                const outOfRange =
                  graded && !isSdBand(band) && rangeExcess(value, min, max) !== 0;
                const name = landmark !== undefined ? landmark.name : undefined;
                const marker = markers[symbol];
                const symbolCell = (muted: boolean) => (
                  <td className={classes.cell_measurement}>
                    <span
                      className={cx(classes.measurement_symbol, {
                        [classes.measurement_symbol__muted]: muted,
                      })}
                    >
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
                const firstCategory = firstCategoryOf[symbol];
                if (firstCategory !== undefined && firstCategory !== category) {
                  // Already tabulated under another finding. The value still
                  // prints in the VALUE column — putting it in a cell that
                  // spans the norm column would read as a norm — and the
                  // pointer sits in the remaining span as a note.
                  return (
                    <tr key={entry.key}>
                      {findingCell}
                      {symbolCell(true)}
                      {valueCell}
                      <td colSpan={2} className={classes.cell_crossref}>
                        norm and deviation under “
                        {mapCategoryToString(firstCategory)}”
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={entry.key}>
                    {findingCell}
                    {symbolCell(false)}
                    {valueCell}
                    <td className={cx(classes.cell_numeric, classes.cell_norm)}>
                      {printNorm(mean, min, max, band)}
                      {graded && !isSdBand(band) ? (
                        <span className={classes.norm_kind}>range</span>
                      ) : null}
                    </td>
                    <td
                      className={cx(classes.cell_numeric, classes.cell_deviation, {
                        [classes.cell_deviation__warn]: stars === 1 || outOfRange,
                        [classes.cell_deviation__error]: stars >= 2,
                      })}
                    >
                      {printDeviation(value, mean, min, max, unit, band)}
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
      {notes}
    </div>
  );
};

export default ResultsTable;
