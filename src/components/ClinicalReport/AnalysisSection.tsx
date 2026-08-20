import * as React from 'react';

import * as cx from 'classnames';

import { AnalysisEvaluation } from 'analyses/evaluate';
import { LateralAnalysisEntry } from 'analyses/lateral';

import ResultsTable from './ResultsTable';
import NormsCharts from './NormsCharts';
import NormsNote from './NormsNote';
import { formatSymbolList, landmarksAre, itOrThem } from './copy';

const classes = require('./style.scss');

export interface AnalysisSectionProps {
  /** Registry entry (id, display name, clinical scope) for this analysis. */
  entry: LateralAnalysisEntry;
  /** Read-only evaluation of the analysis against the placed landmarks. */
  evaluation: AnalysisEvaluation;
  /** 1-based position of this section, printed as a quiet index. */
  index: number;
  /** True for the analysis currently active in the editor. */
  isActive: boolean;
  /** The patient the norms were read against, for this section's norms note. */
  context?: AnalysisContext;
}

/**
 * Why an analysis reported nothing, in the patient's terms — never in the
 * software's. There are three genuinely different causes and each gets its own
 * wording: the analysis interprets nothing at all (no amount of plotting will
 * help), its measurements are all linear and the film has no scale, or its
 * landmarks are not all placed yet (which are named).
 *
 * Shared by the combined report's sections and by the single-analysis report,
 * so the paper can never blame a tracing for a gap in an analysis module.
 */
export const PendingNote = (
  { evaluation }: { evaluation: AnalysisEvaluation },
) => {
  const { totalCount, pendingScaleCount, missingSymbols, isEmpty } = evaluation;
  if (isEmpty) {
    return (
      <p className={classes.sec_pending}>
        This analysis defines no interpreted measurement in this build, so there
        is nothing it can report for this or any other tracing. Placing more
        landmarks will not change that — choose another analysis.
      </p>
    );
  }
  if (pendingScaleCount === totalCount && totalCount > 0) {
    // Everything this analysis interprets is a millimetre measure and the film
    // has no scale: more landmarks would not help.
    return (
      <p className={classes.sec_pending}>
        {totalCount === 1
          ? 'Its measurement is linear (mm) and this radiograph '
          : `All ${totalCount} of its measurements are linear (mm) ` +
            'and this radiograph '}
        has no image scale. Set it from the calibration chip in the toolbar and
        reprint.
      </p>
    );
  }
  return (
    <p className={classes.sec_pending}>
      {totalCount === 1
        ? 'Its measurement cannot be computed yet: '
        : `None of its ${totalCount} measurements can be computed yet: `}
      {missingSymbols.length > 0
        ? `${landmarksAre(missingSymbols.length)} still to be plotted ` +
          `(${formatSymbolList(missingSymbols)}). ` +
          `Plot ${itOrThem(missingSymbols.length)} from the analysis’ step ` +
          'list, then reprint.'
        : 'the geometry does not resolve from the current tracing. ' +
          'Review the analysis’ step list, then reprint.'}
    </p>
  );
};

/**
 * One analysis inside the combined report: heading, its norm-deviation
 * wigglegram and its results table — the same components the single-analysis
 * report uses, so the numbers, units and severity stars are identical.
 *
 * An analysis whose landmarks are not all placed still gets a section: it
 * reports the measurements that do compute and states plainly how many are
 * still waiting for landmarks. Nothing is ever blanked or zeroed.
 */
const AnalysisSection = (props: AnalysisSectionProps) => {
  const { entry, evaluation, index, isActive, context } = props;
  const {
    results, landmarksBySymbol, reportedCount, missingLandmarkCount,
    pendingScaleCount, totalCount, caveats,
  } = evaluation;
  const hasResults = results.length > 0;

  return (
    <section className={classes.sec}>
      {/* Heading + wigglegram are kept together so a heading can never be
          orphaned at the foot of a printed page and the chart never splits.
          `page-break-after: avoid` only applies when a table follows: on a
          section that ends here it would glue the *next* section's heading to
          this one and push both onto a fresh page, leaving a dead band. */}
      <div
        className={cx(classes.sec_keep, {
          [classes.sec_keep__leading]: hasResults,
        })}
      >
        <div className={classes.sec_head}>
          <span className={classes.sec_index}>{index}</span>
          <h2 className={classes.sec_name}>{entry.name}</h2>
          {isActive ? (
            <span className={classes.sec_active}>Active in editor</span>
          ) : null}
          <span className={classes.sec_focus}>{entry.focus}</span>
          <span className={classes.sec_count}>
            {reportedCount} of {totalCount} measured
          </span>
        </div>
        {hasResults ? (
          <NormsCharts
            results={results}
            landmarksBySymbol={landmarksBySymbol}
            showLabel={false}
            showKey={false}
          />
        ) : (
          <PendingNote evaluation={evaluation} />
        )}
      </div>
      {hasResults ? (
        <ResultsTable
          results={results}
          landmarksBySymbol={landmarksBySymbol}
          analysisName={entry.name}
          needsScaleForLinear={pendingScaleCount > 0}
          missingLandmarkCount={missingLandmarkCount}
          missingSymbols={evaluation.missingSymbols}
          caveats={caveats}
          showKey={false}
        />
      ) : null}
      {/* Whose norms this section's deviations are measured against. Printed
          under every section, computable or not: an analysis that reported
          nothing still told the reader which author it would have used. */}
      <NormsNote provenance={entry.analysis.provenance} context={context} />
    </section>
  );
};

export default AnalysisSection;

/** Props of the section list, kept next to the section it repeats. */
export interface AnalysisSectionsProps {
  /** Every lateral analysis, paired with its read-only evaluation. */
  sections: Array<{
    entry: LateralAnalysisEntry;
    evaluation: AnalysisEvaluation;
  }>;
  /** The analysis id active in the editor, marked in its heading. */
  activeAnalysisId: string | null;
  /** The patient the norms were read against (see `AnalysisContext`). */
  context?: AnalysisContext;
}

/**
 * The store keeps the analysis *module* name ('ricketts'), but older saved
 * workspaces and the reducer's own defaults use the module's internal id
 * ('ricketts_lateral'), so both are accepted when marking the active section.
 */
const isActiveEntry = (
  entry: LateralAnalysisEntry, activeAnalysisId: string | null,
): boolean => activeAnalysisId !== null && (
  entry.id === activeAnalysisId || entry.analysis.id === activeAnalysisId
);

export const AnalysisSections = (props: AnalysisSectionsProps) => (
  <div>
    {props.sections.map(({ entry, evaluation }, i) => (
      <AnalysisSection
        key={entry.id}
        entry={entry}
        evaluation={evaluation}
        index={i + 1}
        isActive={isActiveEntry(entry, props.activeAnalysisId)}
        context={props.context}
      />
    ))}
  </div>
);
