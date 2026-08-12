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

// The two modules that already own "can this film do X", so the dashboard's
// launch controls and the editor's toolbar controls cannot disagree.
import { getSuperimpositionTimepoints } from 'components/Superimposition/selectors';
import { getSimulationReadiness } from 'analyses/simulation';

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
  /**
   * The same list as `plottedAnalyses`, by registry id rather than by display
   * name — what the findings panel needs to actually *read* one of those analyses
   * off this film when the clinician asks for it (see
   * `AnalysisFindings#secondaryFindings`). Kept beside the names rather than
   * derived from them, because a display name is a label and an id is a key.
   */
  plottedAnalysisIds: string[];
  /**
   * The tracing itself and the film's scale — the two inputs
   * `analyses/evaluate#evaluateAnalysis` needs, carried here so the findings panel
   * can read a *second* analysis off this film on demand without the store
   * evaluating all nine on every film of every record up front.
   *
   * They are the very objects the store's own selectors hold (identity-stable
   * between recomputes), which is what lets the panel memoize an evaluation
   * against them: a landmark moved in the editor changes the reference, and the
   * cached evaluation goes with it.
   */
  landmarks: { [symbol: string]: GeoObject | undefined };
  scaleFactor: number | null;
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
      // The analyses this film's tracing already carries every manual landmark
      // for — computed once here, and read both as names (the block's tally) and
      // as ids (the analyses the panel can open side by side).
      const plotted = reportable.filter(({ analysis: a }) => (
        getStepsForAnalysis(a, false).every(
          (step) => !isStepManual(step) || landmarks[step.symbol] !== undefined,
        )
      ));
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
        plottedAnalyses: plotted.map(({ name }) => name),
        reportableAnalyses: reportable.map(({ name }) => name),
        plottedAnalysisIds: plotted.map(({ id }) => id),
        landmarks,
        scaleFactor,
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

/**
 * What can be launched from one film's card on the dashboard, and — when
 * something cannot — the sentence that says why.
 *
 * Every one of these three answers is read from the module that already owns the
 * question, never re-derived here, because the dashboard's control and the
 * editor's toolbar control open the *same* view and must agree about whether it
 * is available:
 *
 *  - the treatment simulation's readiness (and its reason) is
 *    `analyses/simulation#getSimulationReadiness`, the same pure rule the
 *    simulation view enables its own movement controls with;
 *  - "this tracing can be registered" is membership of
 *    `Superimposition/selectors#getSuperimpositionTimepoints`, the same list the
 *    superimposition view fills its pickers from;
 *  - the clinical report's gate is the tracing itself: the report prints
 *    measurements computed from placed landmarks, so a film with nothing plotted
 *    would print a chart of "not measured" rows over a bare radiograph. The
 *    toolbar can be loose about this (the film in the editor is the one being
 *    traced); a records surface listing six films cannot.
 */
export interface RecordLaunch {
  /** Whether the printable clinical report has anything to report. */
  canReport: boolean;
  /** Tooltip: the invitation when it can, the reason when it cannot. */
  reportReason: string;
  canSimulate: boolean;
  simulateReason: string;
  /**
   * Whether this film's tracing carries a complete registration basis — i.e.
   * whether it can be one half of a superimposition. Read by the timeline band,
   * which offers the comparison on the interval between two visits.
   */
  isRegistrable: boolean;
}

const NO_TRACING_REASON =
  'Trace this film first — a clinical report prints measurements, and no ' +
  'landmark is plotted on this one yet. Open it in the tracing editor and run ' +
  'Auto-plot.';

const REPORT_REASON =
  'Open the printable clinical report for this film — every analysis it can ' +
  'report, with its norms and provenance (print or save as PDF).';

/**
 * One entry per traceable film of the open patient, keyed by image id. Films
 * that can never be traced are absent: a photograph has no report, no
 * simulation and no registration, and its card says so already.
 */
export const getRecordLaunch = createSelector(
  getPatientRecords,
  getSuperimpositionTimepoints,
  getManualLandmarks,
  getScaleFactor,
  (
    records, timepoints, getLandmarks, getScale,
  ): { [imageId: string]: RecordLaunch | undefined } => {
    const registrable: { [imageId: string]: true } = {};
    timepoints.forEach(({ imageId }) => { registrable[imageId] = true; });
    const launch: { [imageId: string]: RecordLaunch | undefined } = {};
    records.filter((r) => r.isTraceable).forEach((record) => {
      const { imageId } = record;
      const simulation = getSimulationReadiness(
        getLandmarks(imageId), getScale(imageId),
      );
      // The tracing as it exists, not the active analysis' count of it: a film
      // plotted under Downs and then switched to Jarabak still carries every
      // point it was given, and the report evaluates all nine analyses from them.
      const hasTracing = record.landmarkPoints.length > 0;
      launch[imageId] = {
        canReport: hasTracing,
        reportReason: hasTracing ? REPORT_REASON : NO_TRACING_REASON,
        canSimulate: simulation.canSimulate,
        simulateReason: simulation.reason,
        isRegistrable: registrable[imageId] === true,
      };
    });
    return launch;
  },
);

export default getRecordAnalyses;
