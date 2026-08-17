import * as React from 'react';

import * as cx from 'classnames';

import { chipToneFor, orderFindings } from 'components/AnalysisResultsViewer';
import {
  mapCategoryToString,
  mapIndicationToString,
} from 'components/AnalysisResultsViewer/strings';

import { AnalysisEvaluation } from 'analyses/evaluate';
import { LateralAnalysisEntry } from 'analyses/lateral';

import { landmarkCount } from './copy';

const classes = require('./style.scss');

/** Findings shown per analysis before the row is truncated. */
const MAX_FINDINGS = 4;

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
    {/* The key to the marker, immediately under the head — where a reader meets
        the first marked finding, not 700px below it at the foot of the page. */}
    {Object.keys(divergentCategories).length > 0 ? (
      <div className={classes.ov_key}>
        <span className={classes.ov_differs}>differs</span>
        marks a finding the analyses do not agree on; the values behind each
        reading are set side by side in “Where the analyses differ” below. It is
        not a comment on the finding itself.
      </div>
    ) : null}
    {sections.map(({ entry, evaluation }) => {
      // The abnormal findings first, ties in the analysis' own order — the one
      // ranking rule, shared with the Summary dialog and with the records
      // dashboard's findings panel (see `AnalysisResultsViewer/grouping`).
      const findings = orderFindings(evaluation.results);
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
                    {/* A word, not "≠". Set between a finding and its verdict,
                        the sign read as negation — "Skeletal profile ≠ Normal",
                        i.e. *not* normal — the exact inverse of what it means,
                        and its key was at the foot of the page. */}
                    {differs ? (
                      <span
                        className={classes.ov_differs}
                        title="The analyses on this sheet do not agree on this finding — see “Where the analyses differ”"
                      >
                        differs
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
