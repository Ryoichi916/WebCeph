import * as React from 'react';

import * as cx from 'classnames';

import map from 'lodash/map';

// The report must match the Summary dialog's conventions exactly (formatting,
// units, severity stars), so it reuses that component's exported helpers.
import {
  getUnitSuffix,
  getSeverityStars,
  STARS,
} from 'components/AnalysisResultsViewer';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';

import { missingLandmarksNote, printNumber, printSigned } from './copy';

const classes = require('./style.scss');

export interface ResultsTableProps {
  /** Categorized results of one analysis. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions keyed by symbol, for names and units. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
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
}

const NO_SYMBOLS: string[] = [];

/** The star key, printed once per document (see `showKey`). */
export const DeviationKey = () => (
  <span>
    Deviation from norm:{' '}
    <span className={classes.legend_stars}>*</span> over 1 SD
    <span className={classes.legend_dot}>·</span>
    <span className={classes.legend_stars}>**</span> over 2 SD
    <span className={classes.legend_dot}>·</span>
    <span className={classes.legend_stars}>***</span> over 3 SD
  </span>
);

/** Chip classes for a finding, by worst severity among its measurements. */
const chipClassFor = (
  indication: Indication<Category>, worst: number,
): string => {
  const isNormalIndication =
    indication === 'normal' || indication === 'class1';
  return cx(classes.chip, {
    [classes.chip__success]: worst === 0 && isNormalIndication,
    [classes.chip__neutral]: worst === 0 && !isNormalIndication,
    [classes.chip__warn]: worst === 1,
    [classes.chip__error]: worst >= 2,
  });
};

const worstStarsOf = (
  relevantComponents: CategorizedAnalysisResult<Category>['relevantComponents'],
): number => Math.max(0, ...map(
  relevantComponents,
  ({ value, mean, min, max }) => getSeverityStars(value, mean, min, max),
));

/**
 * A single interpreted measurement, laid out as a statement rather than as a
 * one-row five-column table. Björk's analysis reports exactly one measurement:
 * a full table header over a single row read as machine output, and pushed the
 * measurement's real name into a cramped second line.
 */
const SingleMeasurement = (props: ResultsTableProps) => {
  const { results, landmarksBySymbol } = props;
  const result = results[0];
  const component = result.relevantComponents[0];
  const { symbol, value, mean, min, max } = component;
  const landmark = landmarksBySymbol[symbol];
  const unit = getUnitSuffix(landmark);
  const stars = getSeverityStars(value, mean, min, max);
  const sd = (max - min) / 2;
  const name = landmark !== undefined ? landmark.name : undefined;
  return (
    <div className={classes.single}>
      <div className={classes.single_finding}>
        <span className={classes.finding_category}>
          {mapCategoryToString(result.category) || '—'}
        </span>
        <span className={chipClassFor(result.indication, stars)}>
          {mapIndicationToString(result.indication) || '—'}
        </span>
      </div>
      <div className={classes.single_measurement}>
        <span className={classes.single_name}>
          {name !== undefined && name !== symbol ? name : symbol}
        </span>
        <span className={classes.single_symbol}>
          {name !== undefined && name !== symbol ? symbol : ''}
        </span>
      </div>
      <div className={classes.single_numbers}>
        <span
          className={cx(classes.single_value, {
            [classes.cell_value__warn]: stars === 1,
            [classes.cell_value__error]: stars >= 2,
          })}
        >
          {printNumber(value)}{unit}
        </span>
        <span className={classes.single_norm}>
          norm {printNumber(mean)} ± {printNumber(sd)}
          <span className={classes.legend_dot}>·</span>
          <span
            className={cx({
              [classes.cell_deviation__warn]: stars === 1,
              [classes.cell_deviation__error]: stars >= 2,
            })}
          >
            {printSigned(value - mean)}{unit}
            {stars > 0 ? ` ${STARS[stars]}` : ''}
          </span>
        </span>
      </div>
    </div>
  );
};

/**
 * The printed results table: one row per measurement, grouped by clinical
 * finding, with value, norm ± SD and the signed deviation carrying the
 * one-to-three-star severity convention. Used both by the single-analysis
 * report and by every section of the combined ("All analyses") report.
 */
const ResultsTable = (props: ResultsTableProps) => {
  const {
    results, landmarksBySymbol, needsScaleForLinear,
    missingLandmarkCount = 0, missingSymbols = NO_SYMBOLS,
    showKey = true,
  } = props;

  // Same cross-reference logic as the Summary dialog: a measurement shared
  // by several findings is listed in full once and referenced afterwards.
  const firstCategoryOf: { [symbol: string]: Category | undefined } = {};
  let rowCount = 0;
  results.forEach(({ category, relevantComponents }) => {
    relevantComponents.forEach(({ symbol }) => {
      rowCount += 1;
      if (firstCategoryOf[symbol] === undefined) {
        firstCategoryOf[symbol] = category;
      }
    });
  });

  const notes = (
    <div className={classes.legend}>
      {showKey ? <DeviationKey /> : null}
      {missingLandmarkCount > 0 ? (
        // Measurements the geometry cannot produce yet. Naming the count is
        // the honest alternative to printing blanks (or zeros) for them.
        <span className={classes.legend_note}>
          {missingLandmarksNote(missingLandmarkCount, missingSymbols)}
        </span>
      ) : null}
      {needsScaleForLinear ? (
        // The analysis' millimeter measurements are absent from the table
        // above; the record has to say why rather than imply they were
        // within norm.
        <span className={classes.legend_note}>
          Linear (mm) measurements are omitted: this radiograph has no
          image scale. Set it from the calibration chip in the toolbar and
          reprint. Angular values are unaffected.
        </span>
      ) : null}
    </div>
  );

  if (rowCount === 1) {
    return (
      <div>
        <SingleMeasurement {...props} />
        {notes}
      </div>
    );
  }

  return (
    <div>
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.col_finding}>Finding</th>
            <th>Measurement</th>
            <th className={classes.col_numeric}>Value</th>
            <th className={classes.col_numeric}>Norm ± SD</th>
            <th className={classes.col_numeric}>Deviation</th>
          </tr>
        </thead>
        {map(results, ({ category, indication, relevantComponents }) => {
          const worst = worstStarsOf(relevantComponents);
          const chipClass = chipClassFor(indication, worst);
          return (
            <tbody key={category} className={classes.group}>
              {map(relevantComponents, (component, i) => {
                const { symbol, value, mean, min, max } = component;
                const landmark = landmarksBySymbol[symbol];
                const unit = getUnitSuffix(landmark);
                const stars = getSeverityStars(value, mean, min, max);
                const sd = (max - min) / 2;
                const name = landmark !== undefined ? landmark.name : undefined;
                const findingCell = i === 0 ? (
                  <td
                    rowSpan={relevantComponents.length}
                    className={classes.cell_finding}
                  >
                    <span className={classes.finding_category}>
                      {mapCategoryToString(category) || '—'}
                    </span>
                    <span className={chipClass}>
                      {mapIndicationToString(indication) || '—'}
                    </span>
                  </td>
                ) : null;
                const valueCell = (
                  <td
                    className={cx(classes.cell_numeric, classes.cell_value, {
                      [classes.cell_value__warn]: stars === 1,
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
                    <tr key={symbol}>
                      {findingCell}
                      <td className={classes.cell_measurement}>
                        <span
                          className={cx(
                            classes.measurement_symbol,
                            classes.measurement_symbol__muted,
                          )}
                        >
                          {symbol}
                        </span>
                        {name !== undefined && name !== symbol ? (
                          <span className={classes.measurement_name}>
                            {name}
                          </span>
                        ) : null}
                      </td>
                      {valueCell}
                      <td colSpan={2} className={classes.cell_crossref}>
                        norm and deviation under “
                        {mapCategoryToString(firstCategory)}”
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={symbol}>
                    {findingCell}
                    <td className={classes.cell_measurement}>
                      <span className={classes.measurement_symbol}>{symbol}</span>
                      {name !== undefined && name !== symbol ? (
                        <span className={classes.measurement_name}>
                          {name}
                        </span>
                      ) : null}
                    </td>
                    {valueCell}
                    <td className={cx(classes.cell_numeric, classes.cell_norm)}>
                      {printNumber(mean)}
                      <span className={classes.norm_sd}>
                        {' ± '}{printNumber(sd)}
                      </span>
                    </td>
                    <td
                      className={cx(classes.cell_numeric, classes.cell_deviation, {
                        [classes.cell_deviation__warn]: stars === 1,
                        [classes.cell_deviation__error]: stars >= 2,
                      })}
                    >
                      {printSigned(value - mean)}{unit}
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
