import * as React from 'react';

import * as cx from 'classnames';

import map from 'lodash/map';

import { chipToneFor } from 'components/AnalysisResultsViewer';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';

import { NEUTRAL_CATEGORY } from 'analyses/helpers';
import { AnalysisEvaluation } from 'analyses/evaluate';
import { LateralAnalysisEntry } from 'analyses/lateral';

import { landmarkCount } from './copy';

const classes = require('./style.scss');

/** Findings shown per analysis before the row is truncated. */
const MAX_FINDINGS = 4;

interface Finding {
  category: Category;
  indication: Indication<Category>;
}

/**
 * The analysis' findings ordered for a one-line summary: the abnormal ones
 * first, since those are what a reader scanning the overview needs to see.
 * Ties keep the analysis' own order.
 *
 * Ordering (and chip colour) follow the *indication*, not the worst star count
 * in the group: the same conclusion has to look the same here as it does in the
 * analysis' own section further down, and a group's worst member is not that
 * conclusion's severity.
 */
const summarize = (results: AnalysisEvaluation['results']): Finding[] => {
  const findings: Finding[] = map(results.filter(
    // The neutral bucket carries measured values that name no clinical
    // finding, so it has no place in a list of headline findings — every one
    // of its rows is printed in full in the analysis' own section below.
    (r) => r.category !== NEUTRAL_CATEGORY,
  ), ({ category, indication }) => ({ category, indication }));
  const rank = (f: Finding) => (chipToneFor(f.indication) === 'warn' ? 0 : 1);
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (rank(a.f) - rank(b.f)) || (a.i - b.i))
    .map(({ f }) => f);
};

export interface FindingsOverviewProps {
  sections: Array<{
    entry: LateralAnalysisEntry;
    evaluation: AnalysisEvaluation;
  }>;
  /**
   * Categories the analyses disagree on. Marked here and explained in the note
   * under the table, so two conflicting chips on the same page can never read
   * as a fault in the software.
   */
  divergentCategories?: { [category: string]: true };
}

const NONE: { [category: string]: true } = {};

/**
 * Compact contents page for the combined report: one line per analysis with
 * its headline interpretations, so the reader can see the whole picture before
 * reading the individual tables. Every chip here is repeated in full — with
 * its numbers — in that analysis' own section further down.
 */
const FindingsOverview = (
  { sections, divergentCategories = NONE }: FindingsOverviewProps,
) => (
  <div className={classes.ov}>
    {/* Column heads: the right-hand fraction is meaningless without one. */}
    <div className={cx(classes.ov_row, classes.ov_row__head)}>
      <span className={classes.ov_name}>Analysis</span>
      <span className={classes.ov_findings}>Headline findings</span>
      <span className={classes.ov_count}>Measured</span>
    </div>
    {sections.map(({ entry, evaluation }) => {
      const findings = summarize(evaluation.results);
      const shown = findings.slice(0, MAX_FINDINGS);
      const hidden = findings.length - shown.length;
      return (
        <div key={entry.id} className={classes.ov_row}>
          <span className={classes.ov_name}>{entry.name}</span>
          <span className={classes.ov_findings}>
            {shown.length > 0 ? shown.map(({ category, indication }) => {
              const tone = chipToneFor(indication);
              const differs =
                divergentCategories[category as string] === true;
              return (
                <span key={category} className={classes.ov_pair}>
                  <span className={classes.ov_cat}>
                    {mapCategoryToString(category) || '—'}
                    {differs ? (
                      <span
                        className={classes.ov_differs}
                        title="This category differs between analyses"
                      >
                        ≠
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cx(classes.chip, classes.chip__interp, {
                      [classes.chip__success]: tone === 'success',
                      [classes.chip__neutral]: tone === 'neutral',
                      [classes.chip__warn]: tone === 'warn',
                    })}
                  >
                    {mapIndicationToString(indication) || '—'}
                  </span>
                </span>
              );
            }) : (
              <span className={classes.ov_none}>
                {evaluation.isEmpty
                  ? 'Defines no interpreted measurement — see the section below'
                  : evaluation.pendingScaleCount === evaluation.totalCount
                    ? 'Linear measurements only — needs an image scale'
                    : evaluation.missingSymbols.length > 0
                      ? `Awaiting ${landmarkCount(
                          evaluation.missingSymbols.length,
                        )} — see the section below`
                      : 'Nothing computes from the current tracing'}
              </span>
            )}
            {hidden > 0 ? (
              <span className={classes.ov_more}>
                +{hidden} more below
              </span>
            ) : null}
          </span>
          <span className={classes.ov_count}>
            {evaluation.reportedCount}/{evaluation.totalCount}
          </span>
        </div>
      );
    })}
  </div>
);

export default FindingsOverview;
