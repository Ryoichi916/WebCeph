import every from 'lodash/every';
import some from 'lodash/some';
import filter from 'lodash/filter';
import keyBy from 'lodash/keyBy';
import map from 'lodash/map';
import mapValues from 'lodash/mapValues';
import memoize from 'lodash/memoize';

import {
  getStepsForAnalysis,
  areEqualSteps,
  areEqualSymbols,
  isStepManual,
  isStepComputable,
  isStepMappable,
  tryCalculate,
  tryMap,
} from 'analyses/helpers';

import { isGeoPoint } from 'utils/math';

/**
 * Read-only evaluation of one analysis against a set of placed landmarks.
 *
 * The store only ever computes the *active* analysis (see
 * `store/reducers/workspace/analyses.ts`). The combined report needs the other
 * lateral analyses too, so this module walks exactly the same path those
 * selectors walk — `tryMap` → `tryCalculate` → `analysis.interpret` — with the
 * same mm scale-factor rule and the same suppression of millimetre values on
 * an uncalibrated image. It reads nothing from and writes nothing to the store,
 * and it never changes which analysis is active.
 *
 * Keep this in sync with the selector chain it mirrors: `getMappedValue`,
 * `getCalculatedValue`, `getAllGeoObjects`, `getCategorizedAnalysisResults`
 * and `isStepValuePendingScale`.
 */
export interface AnalysisEvaluation {
  /** Categorized results, exactly as the Summary/report table consumes them. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** Landmark definitions of the analysis' components, keyed by symbol. */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /** Interpreted measurements that yielded a reportable value. */
  reportedCount: number;
  /**
   * Interpreted measurements with no value because some of the landmarks they
   * are built from have not been placed yet.
   */
  missingLandmarkCount: number;
  /**
   * Interpreted measurements whose geometry *does* yield a number, withheld
   * only because the image carries no mm/px scale (see `getCalculatedValue`).
   */
  pendingScaleCount: number;
  /** Interpreted measurements the analysis defines in total. */
  totalCount: number;
  /**
   * Symbols of the landmarks this analysis needs that have not been placed
   * yet — the analysis' own step list, filtered to what is still outstanding.
   * Naming them turns "cannot compute" into something the clinician can act
   * on without hunting through the stepper.
   */
  missingSymbols: string[];
  /**
   * True when the analysis defines no interpreted measurement at all, so there
   * is nothing it could ever report. Distinguished from "awaiting landmarks":
   * plotting more points would not help.
   */
  isEmpty: boolean;
  /**
   * Warnings the analysis draws from its own numbers — a landmark the values
   * say is misplaced, not a finding about the patient (see `AnalysisCaveat`).
   */
  caveats: AnalysisCaveat[];
}

/**
 * The measurement symbols an analysis reports when its data is complete.
 *
 * `Analysis.interpret` — not the landmarks — decides what actually reaches the
 * results table: a module can define components and still interpret none of
 * them (`tweed` currently does). So the set is probed by running the analysis'
 * own `interpret` over its norm means: no patient number is involved, the
 * question is only "what would this analysis report if nothing were missing?".
 * That is what makes an "8 of 8 measured" count in the report honest.
 */
export const getReportableSymbols = (
  analysis: Analysis<ImageType>,
): string[] => {
  const means: { [symbol: string]: number | undefined } = {};
  analysis.components.forEach(({ landmark, mean }) => {
    // A component reported without a published norm (see `NO_NORM`) has a mean
    // of NaN, which `interpret` refuses to report. The probe asks "what would
    // this analysis report if nothing were missing?", so it stands in a finite
    // value — the answer must be yes for such a measurement, which does reach
    // the table as a measured value.
    means[landmark.symbol] = isFinite(mean) ? mean : 0;
  });
  try {
    const symbols: { [symbol: string]: true } = {};
    analysis.interpret(means, {}).forEach(({ relevantComponents }) => {
      relevantComponents.forEach(({ symbol }) => {
        symbols[symbol] = true;
      });
    });
    return Object.keys(symbols);
  } catch (e) {
    // An analysis that cannot be probed is assumed to report everything it
    // defines; better to over-count than to hide a measurement.
    return map(analysis.components, c => c.landmark.symbol);
  }
};

/**
 * Whether an analysis has anything at all it could report. An analysis without
 * any (a module still to be filled in) is left out of the combined report
 * rather than printed as a section of zeroes.
 */
export const definesMeasurements = (analysis: Analysis<ImageType>): boolean =>
  getReportableSymbols(analysis).length > 0;

export const evaluateAnalysis = (
  analysis: Analysis<ImageType>,
  manualLandmarks: { [symbol: string]: GeoObject | undefined },
  scaleFactor: number | null,
  /**
   * The patient the norms are read against, so an author's age correction or
   * sex split is applied here exactly as the store applies it to the active
   * analysis (see `adjustComponentsForPatient`). Omitted, the published
   * figures are used unchanged.
   */
  context?: AnalysisContext,
): AnalysisEvaluation => {
  // Same step list the store builds for the active analysis.
  const steps = getStepsForAnalysis(analysis, false);
  const stepsBySymbol = keyBy(steps, s => s.symbol);
  const hasScale = scaleFactor !== null && scaleFactor > 0;

  // --- mapping (mirrors isManualStepMappingComplete → getMappedValue) -------

  const isManualStepComplete = (step: CephLandmark): boolean => {
    if (isStepMappable(step)) {
      return manualLandmarks[step.symbol] !== undefined;
    }
    return true;
  };

  const isEligibleForMapping = (step: CephLandmark): boolean => {
    if (isStepManual(step)) {
      return false;
    }
    return every(step.components, (sub: CephLandmark) => (
      isStepManual(sub) ? isManualStepComplete(sub) : isEligibleForMapping(sub)
    ));
  };

  const getMapped = memoize((step: CephLandmark): GeoObject | undefined => {
    if (isEligibleForMapping(step)) {
      return tryMap(step, manualLandmarks);
    }
    return manualLandmarks[step.symbol] || undefined;
  });

  const isMappingComplete = (step: CephLandmark): boolean => {
    if (isStepMappable(step)) {
      return getMapped(step) !== undefined;
    }
    return true;
  };

  // --- computation (mirrors isStepEligibleForComputation → getCalculatedValue)

  // `areEqualSteps` compares component trees, so this scan is the expensive
  // part of an evaluation and the combined report runs one per analysis —
  // memoized by symbol, which is unique across `steps`.
  const findEqualComponents = memoize(
    (step: CephLandmark): CephLandmark[] => filter(
      steps,
      s => !areEqualSymbols(step, s) && areEqualSteps(step, s),
    ),
    (step: CephLandmark) => step.symbol,
  );

  const isEligibleForComputation = (step: CephLandmark): boolean => (
    isStepComputable(step) &&
    every(step.components, (c: CephLandmark) => some(
      [c, ...findEqualComponents(c)],
      eq => isMappingComplete(eq),
    ))
  );

  const getRawValue = memoize((step: CephLandmark): number | undefined => {
    if (!isEligibleForComputation(step)) {
      return undefined;
    }
    return tryCalculate(step, manualLandmarks, {});
  });

  const getValue = (step: CephLandmark): number | undefined => {
    const value = getRawValue(step);
    // Linear measurements leave the geometry in image pixels. With a
    // calibration they become millimetres; without one there is no honest
    // millimetre value to report, so the measurement stays uncalculated and
    // drops out of the interpretation entirely.
    if (typeof value === 'number' && step.unit === 'mm') {
      return hasScale ? value * scaleFactor! : undefined;
    }
    return value;
  };

  const isPendingScale = (step: CephLandmark): boolean => {
    if (step.unit !== 'mm' || hasScale) {
      return false;
    }
    return typeof getRawValue(step) === 'number';
  };

  // --- interpretation (mirrors getCategorizedAnalysisResults) ---------------

  const values = mapValues(stepsBySymbol, (s: CephLandmark) => getValue(s));

  const objects: { [symbol: string]: GeoObject | undefined } = mapValues(
    stepsBySymbol,
    (s: CephLandmark) => {
      const mapped = getMapped(s);
      // A stored *point* under a computed measurement's symbol can never be
      // that measurement's geometry (see getAllGeoObjects).
      if (s.type !== 'point' && isGeoPoint(mapped)) {
        return undefined;
      }
      return mapped;
    },
  );
  Object.keys(manualLandmarks).forEach((symbol) => {
    const step = stepsBySymbol[symbol];
    if (step !== undefined && step.type !== 'point') {
      return;
    }
    if (objects[symbol] === undefined) {
      objects[symbol] = manualLandmarks[symbol];
    }
  });

  const results = analysis.interpret(values, objects, context);
  const caveats = typeof analysis.caveats === 'function'
    ? analysis.caveats(values)
    : [];

  // --- honest accounting of what could not be reported ----------------------

  let reportedCount = 0;
  let missingLandmarkCount = 0;
  let pendingScaleCount = 0;
  const reportable = keyBy(getReportableSymbols(analysis));
  analysis.components.forEach(({ landmark }) => {
    // Only measurements this analysis actually reports can appear in the
    // results table, so only those are counted as reported or missing.
    if (reportable[landmark.symbol] === undefined) {
      return;
    }
    if (typeof getValue(landmark) === 'number') {
      reportedCount += 1;
    } else if (isPendingScale(landmark)) {
      pendingScaleCount += 1;
    } else {
      missingLandmarkCount += 1;
    }
  });

  // The analysis' own step list, filtered to the points still to be placed.
  const missingSymbols = map(
    filter(
      steps,
      s => isStepManual(s) && manualLandmarks[s.symbol] === undefined,
    ),
    s => s.symbol,
  );

  const totalCount = reportedCount + missingLandmarkCount + pendingScaleCount;

  return {
    results,
    landmarksBySymbol: keyBy(
      map(analysis.components, c => c.landmark),
      l => l.symbol,
    ),
    reportedCount,
    missingLandmarkCount,
    pendingScaleCount,
    totalCount,
    missingSymbols,
    isEmpty: totalCount === 0,
    caveats,
  };
};

export default evaluateAnalysis;
