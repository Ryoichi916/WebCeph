import * as React from 'react';

import Wigglegram, { buildRows as buildSdRows } from './Wigglegram';
import TargetBand, { buildRows as buildTargetRows } from './TargetBand';

const classes = require('./style.scss');

interface Props {
  /** Categorized results of the active analysis, as passed to the report. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions keyed by symbol, for names and units. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /** See `Wigglegram`'s identical prop. */
  showLabel?: boolean;
  /** See `Wigglegram`'s identical prop. */
  showKey?: boolean;
}

/**
 * Every norm-deviation chart a section's results can carry, together: the
 * standard-deviation wigglegram for the measurements this app grades against
 * a mean ± SD, and the target-range band for the ones it grades against a
 * published target (Tweed's FMA/IMPA/FMIA — see `TargetBand`). Every section
 * with a `hasResults` table used to get exactly `<Wigglegram>`, unconditionally
 * — which for Tweed (whose triangle is normed as targets, not an SD) meant
 * `Wigglegram` silently rendered nothing (its own `rows.length < 2` guard) and
 * the section jumped straight from its header to the results table with no
 * chart at all, on the printed page indistinguishable from a broken render.
 * Both the single-analysis report and every section of the combined report
 * now render through this component instead of `Wigglegram` directly, so
 * neither call site can drift back to that gap.
 *
 * If an analysis' computed rows plot on *neither* chart — too few
 * standard-deviation rows for a profile line, and no computed target-range
 * row either, which only happens on a partial tracing (Tweed's triangle
 * landmarks not all placed, leaving only the borrowed Y axis) — a short note
 * says so in place of the chart, so a printed gap always reads as a stated
 * fact about the tracing rather than as a defect in the page.
 */
const NormsCharts = ({
  results, landmarksBySymbol, showLabel = true, showKey = true,
}: Props) => {
  const sdRows = buildSdRows(results, landmarksBySymbol);
  const targetRows = buildTargetRows(results, landmarksBySymbol);
  const hasWigglegram = sdRows.length >= 2;
  const hasTargetBand = targetRows.length >= 1;

  if (!hasWigglegram && !hasTargetBand) {
    return (
      <p className={classes.norms_chart_note}>
        None of this analysis' computed measurements plot on a chart yet: too
        few are graded against a standard deviation to draw a profile line,
        and none of its published-target measurements have computed from the
        landmarks placed so far. See the values themselves in the table below.
      </p>
    );
  }

  return (
    <>
      {hasWigglegram ? (
        <Wigglegram
          results={results}
          landmarksBySymbol={landmarksBySymbol}
          showLabel={showLabel}
          showKey={showKey}
        />
      ) : null}
      {hasTargetBand ? (
        <TargetBand
          results={results}
          landmarksBySymbol={landmarksBySymbol}
          showLabel={showLabel}
          showKey={showKey}
        />
      ) : null}
    </>
  );
};

export default NormsCharts;
