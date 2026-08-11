import { createSelector } from 'reselect';

import keyBy from 'lodash/keyBy';
import map from 'lodash/map';

import { getPatientRecords } from 'store/reducers/workspace';
import {
  getManualLandmarks,
  getScaleFactor,
} from 'store/reducers/workspace/image';
import {
  getActiveAnalysis,
  getAnalysisCaveats,
  getCategorizedAnalysisResults,
  getPatientAnalysisContext,
} from 'store/reducers/workspace/analyses';

import {
  evaluateAnalysis,
  definesMeasurements,
} from 'analyses/evaluate';
import LATERAL_ANALYSES from 'analyses/lateral';
import { getStepsForAnalysis, isStepManual } from 'analyses/helpers';

/**
 * What one traced film reports, for the records dashboard's analysis findings —
 * read-only, and read through the **same evaluation path** the Summary dialog
 * and the printed report use.
 *
 * The two halves of that are deliberate, and they are the halves the clinical
 * report itself uses (see `ClinicalReport/index.tsx#renderActiveResultsTable`):
 *
 *  - the **numbers and the findings** come from the store's own selector chain
 *    (`getCategorizedAnalysisResults`), which is literally the array the Summary
 *    dialog renders — for *that* film, since every one of these selectors is
 *    indexed by image id rather than by "the image in the editor". So the
 *    dashboard cannot print a value the Summary would print differently: it is
 *    the same array, formatted by the same exported formatters.
 *  - the **accounting** (how many of the analysis' measurements were reported,
 *    how many are waiting on landmarks, how many millimetre values are withheld
 *    for want of a scale) comes from `analyses/evaluate`, which is where the
 *    report gets it, because the store does not count what it could not compute.
 *
 * Nothing here dispatches, nothing changes which analysis is active, and no norm
 * is recomputed locally: the age- and sex-corrected figures arrive inside
 * `results` exactly as the analysis' own `interpret` produced them.
 */
export interface RecordAnalysis {
  imageId: string;
  /** The analysis set on this film, or null when it carries none. */
  analysisId: string | null;
  /**
   * Categorized results for this film — the very array the Summary dialog
   * renders for it.
   */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions of the analysis' components, keyed by symbol. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /** Warnings the analysis draws from its own numbers (misplaced landmarks). */
  caveats: AnalysisCaveat[];
  /** Interpreted measurements that yielded a reportable value. */
  reportedCount: number;
  /** Interpreted measurements this analysis defines in total. */
  totalCount: number;
  /** Measurements withheld only because the film carries no mm/px scale. */
  pendingScaleCount: number;
  /** Measurements with no value because landmarks they need are unplaced. */
  missingLandmarkCount: number;
  /** The analysis' own landmarks that are still to be placed. */
  missingSymbols: string[];
  /**
   * How many of the app's reportable lateral analyses have every landmark they
   * need already placed on this film, and how many there are. This is the
   * honest answer to "which analyses can this film report": the app stores one
   * *active* analysis per image, so anything beyond that is a statement about
   * the tracing, not a record of an analysis having been run.
   *
   * Read by the findings panel's block head (`AnalysisFindings#FilmBlock`),
   * which is the surface that asks the question. A field nothing reads is a
   * loop run on every recompute for nobody: `needsScaleForLinear` was one, and
   * it said nothing `pendingScaleCount` does not, so it is gone.
   */
  plottedAnalyses: string[];
  reportableAnalyses: string[];
  /** The patient the norms were read against, as the store built it. */
  context: AnalysisContext;
  /**
   * Whose norms this film was graded against, or null when the analysis states
   * none — the analysis' own `provenance`, so the panel can print the sentence
   * *that* analysis wrote about *this* patient (`NormsProvenance.patientNote`)
   * instead of a generic claim about corrections.
   */
  provenance: NormsProvenance | null;
  /**
   * How many of the analysis' own components its author indexed by age
   * (`perYearFrom`) and by sex (`sexMeans`). Counted from the analysis rather
   * than assumed, because it is the difference between "corrected for age 14 y
   * 9 m" and a sentence that is simply false: only Ricketts (four figures) and
   * Jacobson's Wits (one) index anything in this build, and the panel used to
   * claim an age and sex correction on every film of every analysis.
   */
  ageIndexedCount: number;
  sexIndexedCount: number;
}

/** The registry entry for an id stored on an image, or undefined. */
const findEntry = (analysisId: string | null) => (
  analysisId === null ? undefined : LATERAL_ANALYSES.filter(
    (e) => e.id === analysisId || e.analysis.id === analysisId,
  )[0]
);

/**
 * One entry per traceable film of the open patient, in the records' own order
 * (oldest capture date first), so the dashboard's findings read as a chronology.
 *
 * Non-traceable records are absent rather than present-and-empty: a photograph
 * has no cephalometric finding to report and the records panel already says so.
 */
export const getRecordAnalyses = createSelector(
  getPatientRecords,
  getCategorizedAnalysisResults,
  getActiveAnalysis,
  getAnalysisCaveats,
  getPatientAnalysisContext,
  getManualLandmarks,
  getScaleFactor,
  (
    records, getResults, getAnalysis, getCaveats, getContext,
    getLandmarks, getScale,
  ): RecordAnalysis[] => {
    // Which lateral analyses could report anything at all. An analysis module
    // that interprets no measurement (Tweed, in this build) is left out here for
    // the same reason the combined report leaves it out of its sections: a "0 of
    // 0" is a gap in the software, not a finding about the patient.
    const reportable = LATERAL_ANALYSES.filter(
      ({ analysis }) => definesMeasurements(analysis),
    );
    return records.filter((r) => r.isTraceable).map((record): RecordAnalysis => {
      const { imageId } = record;
      const analysis = getAnalysis(imageId);
      const landmarks = getLandmarks(imageId);
      const scaleFactor = getScale(imageId);
      const context = getContext(imageId);
      const entry = findEntry(record.analysisId);
      // The accounting of what could *not* be reported. Read for the analysis
      // set on the film, from the same module the report evaluates.
      const evaluation = entry !== undefined
        ? evaluateAnalysis(entry.analysis, landmarks, scaleFactor, context)
        : null;
      return {
        imageId,
        analysisId: record.analysisId,
        results: getResults(imageId),
        landmarksBySymbol: analysis !== null
          ? keyBy(
            map(analysis.components, (c) => c.landmark),
            (l: CephLandmark) => l.symbol,
          )
          : {},
        caveats: getCaveats(imageId),
        reportedCount: evaluation !== null ? evaluation.reportedCount : 0,
        totalCount: evaluation !== null ? evaluation.totalCount : 0,
        pendingScaleCount: evaluation !== null ? evaluation.pendingScaleCount : 0,
        missingLandmarkCount:
          evaluation !== null ? evaluation.missingLandmarkCount : 0,
        missingSymbols: evaluation !== null ? evaluation.missingSymbols : [],
        // Cheap, and it claims nothing about computation: an analysis whose every
        // manual step is on this film needs no further plotting to be reported.
        plottedAnalyses: reportable.filter(({ analysis: a }) => (
          getStepsForAnalysis(a, false).every(
            (step) => !isStepManual(step) || landmarks[step.symbol] !== undefined,
          )
        )).map(({ name }) => name),
        reportableAnalyses: reportable.map(({ name }) => name),
        context,
        provenance: entry !== undefined && entry.analysis.provenance !== undefined
          ? entry.analysis.provenance : null,
        ageIndexedCount: entry !== undefined
          ? entry.analysis.components.filter(
            (c) => c.perYearFrom !== undefined,
          ).length
          : 0,
        sexIndexedCount: entry !== undefined
          ? entry.analysis.components.filter(
            (c) => c.sexMeans !== undefined,
          ).length
          : 0,
      };
    });
  },
);

export default getRecordAnalyses;
