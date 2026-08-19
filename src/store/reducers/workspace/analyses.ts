import { createSelector } from 'reselect';
import { handleActions } from 'utils/store';

import every from 'lodash/every';
import some from 'lodash/some';
import filter from 'lodash/filter';
import find from 'lodash/find';
import isEmpty from 'lodash/isEmpty';
import memoize from 'lodash/memoize';
import keyBy from 'lodash/keyBy';
import mapValues from 'lodash/mapValues';

import {
  getManualLandmarks,
  getSkippedSteps,
  getAnalysisId,
  getScaleFactor,
  hasScaleFactor,
  getImageCaptureDate,
} from './image';

import { getActivePatient } from 'store/reducers/patients';
import { getAnalysisContext } from 'utils/patient';
import { parseCaptureDate } from 'utils/records';

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

const KEY_ANALYSIS_LOAD_STATUS: StoreKey = 'analyses.status';
const KEY_LAST_USED_ID: StoreKey = 'analyses.lastUsedId';
const KEY_SUMMARY_SHOWN: StoreKey = 'analyses.summary.isShown';

const analysisLoadStatusReducer = handleActions<typeof KEY_ANALYSIS_LOAD_STATUS>({
  SET_ANALYSIS_REQUESTED: (state, { payload: { analysisId, imageType } }) => {
    return {
      ...state,
      [imageType]: {
        ...state[imageType],
        [analysisId]: {
          isLoading: true,
          error: null,
        },
      },
    };
  },
  FETCH_ANALYSIS_FAILED: (state, { payload: { analysisId, imageType, error } }) => {
    return {
      ...state,
      [imageType]: {
        ...state[imageType],
        [analysisId]: {
          isLoading: false,
          error,
        },
      },
    };
  },
  FETCH_ANALYSIS_SUCCEEDED: (state, { payload: { analysisId, imageType } }) => {
    return {
      ...state,
      [imageType]: {
        ...state[imageType],
        [analysisId]: {
          isLoading: false,
          error: null,
        },
      },
    };
  },
}, { });

const reducers: Partial<ReducerMap> = {
  [KEY_ANALYSIS_LOAD_STATUS]: analysisLoadStatusReducer,
  [KEY_LAST_USED_ID]: handleActions<typeof KEY_LAST_USED_ID>({
    // Not `SET_ANALYSIS_REQUESTED` itself: `fetchAnalysis` middleware sits
    // ahead of the reducers and never forwards that raw request through —
    // only its eventual `FETCH_ANALYSIS_SUCCEEDED`/`FETCH_ANALYSIS_FAILED`
    // reach here (see `store/middleware/fetchAnalysis`). Keying off the
    // *succeeded* outcome is if anything more honest: this only remembers a
    // choice once the analysis module actually loaded.
    FETCH_ANALYSIS_SUCCEEDED: (state, { payload: { imageType, analysisId } }) => {
      return {
        ...state,
        [imageType]: analysisId,
      };
    },
  }, {
    // ceph_lateral's seed matches `defaultImageProps.analysis` (see
    // store/reducers/workspace/image) rather than an arbitrary analysis, so a
    // virgin install — where the clinician has never explicitly chosen one —
    // is indistinguishable from "no choice yet" to `analysisDefault`'s
    // middleware: applying this seed to a freshly filed film is a no-op,
    // exactly the behaviour a fresh install always had, until the clinician's
    // first explicit pick overwrites it for real.
    ceph_lateral: 'downs',
    ceph_pa: 'ricketts_frontal',
    photo_frontal: 'frontal_face_proportions',
    photo_lateral: 'soft_tissues_photo_lateral',
    photo_intraoral: 'intraoral_photo_record',
    panoramic: 'panoramic_analysis',
  }),
  [KEY_SUMMARY_SHOWN]: handleActions<typeof KEY_SUMMARY_SHOWN>({
    TOGGLE_ANALYSIS_RESULTS_REQUESTED: (state) => !state,
  }, false),
};

export default reducers;

export const isSummaryShown = (state: StoreState) => state[KEY_SUMMARY_SHOWN];

export const isAnalysisSet = createSelector(
  getAnalysisId,
  (getId) => (imageId: string) => getId(imageId) !== null,
);

export const getActiveAnalysis = createSelector(
  getAnalysisId,
  (getAnalysisId) => (imageId: string) => {
    const analysisId = getAnalysisId(imageId);
    if (analysisId !== null) {
      const mod = require(
        /* webpackExclude: /\.test\.tsx?$/ */
        `analyses/${analysisId}`
      );
      // Analyses are ES modules (`export default`); unwrap the default export.
      return (mod.default || mod) as Analysis<ImageType>;
    }
    return null;
  },
);

export const getActiveAnalysisSteps = createSelector(
  getActiveAnalysis,
  (getAnalysis) => (imageId: string): CephLandmark[] => {
    const analysis = getAnalysis(imageId);
    return analysis === null ? [] : getStepsForAnalysis(analysis, false);
  },
);

export const getAllPossibleActiveAnalysisSteps = createSelector(
  getActiveAnalysis,
  (getAnalysis) => (imageId: string): CephLandmark[] => {
    const analysis = getAnalysis(imageId);
    return analysis === null ? [] : getStepsForAnalysis(analysis, false);
  },
);

type T = ((symbol: string, include: boolean) => null | CephLandmark);
export const findStepBySymbol = createSelector(
  getAllPossibleActiveAnalysisSteps,
  getActiveAnalysisSteps,
  (getSteps, getDeduplicatedSteps) => (imageId: string): T => {
    return (symbol: string, includeDuplicates = true): CephLandmark | null => {
      const steps = getSteps(imageId);
      const deduplicatedSteps = getDeduplicatedSteps(imageId);
      return find(
        includeDuplicates ? steps : deduplicatedSteps,
        (step: CephLandmark) => step.symbol === symbol,
      ) || null;
    };
  },
);

export const getManualSteps = createSelector(
  getActiveAnalysisSteps,
  (getSteps) => (imageId: string) => filter(getSteps(imageId), isStepManual),
);

export const isStepSkippable = isStepManual;
export const isStepRemovable = isStepManual;

export const getExpectedNextManualLandmark = createSelector(
  getManualSteps,
  getManualLandmarks,
  (getSteps, getManual) => (imageId: string): CephLandmark | null => {
    const manualLandmarks = getManual(imageId);
    const manualSteps = getSteps(imageId);
    return find(
      manualSteps,
      step => manualLandmarks[step.symbol] === undefined,
    ) || null;
  },
);

const EMPTY_ARRAY: CephLandmark[] = [];
type C = (step: CephLandmark) => CephLandmark[];
export const findEqualComponents = createSelector(
  getAllPossibleActiveAnalysisSteps,
  (getSteps) => (imageId: string): C => (step: CephLandmark): CephLandmark[] => {
    const steps = getSteps(imageId);
    const cs = filter(steps, s => !areEqualSymbols(step, s) && areEqualSteps(step, s)) || EMPTY_ARRAY;
    return cs;
  },
);

/**
 * Determines whether a landmark that was defined with a `map`
 * method has been mapped. Returns true if the landmark does
 * not define a `map` method.
 */
export const isManualStepMappingComplete = createSelector(
  getManualLandmarks,
  (getManual) => (imageId: string): ((step: CephLandmark) => boolean) => (step: CephLandmark) => {
    const objects = getManual(imageId);
    if (isStepMappable(step)) {
      return typeof objects[step.symbol] !== 'undefined';
    }
    return true;
  },
);

export const isManualStepComplete = isManualStepMappingComplete;

export const isStepEligibleForAutomaticMapping = createSelector(
  isManualStepComplete,
  (isComplete) => (imageId: string) => {
    const isEligible = (s: CephLandmark): boolean => {
      if (isStepManual(s)) {
        return false;
      }
      return every(s.components, subcomponent => {
        if (isStepManual(subcomponent)) {
          return isComplete(imageId)(subcomponent);
        }
        return isEligible(subcomponent);
      });
    };
    return isEligible;
  },
);

export const getMappedValue = createSelector(
  isStepEligibleForAutomaticMapping,
  getManualLandmarks,
  (isEligible, getManual) => (imageId: string) => memoize((step: CephLandmark) => {
    const manual = getManual(imageId);
    if (isEligible(imageId)(step)) {
      return tryMap(step, manual);
    }
    return manual[step.symbol] || undefined;
  }),
);

type D = (step: CephLandmark) => boolean;
/**
 * Determines whether a landmark that was defined with a `map`
 * method has been mapped. Returns true if the landmark does
 * not define a `map` method.
 */
export const isStepMappingComplete = createSelector(
  getMappedValue,
  (getMapped) => (imageId: string): D => (step: CephLandmark) => {
    if (isStepMappable(step)) {
      return typeof getMapped(imageId)(step) !== 'undefined';
    }
    return true;
  },
);

export const isStepEligibleForComputation = createSelector(
  isStepMappingComplete,
  findEqualComponents,
  (isMapped, findEqual) => (imageId: string): D => (step: CephLandmark) => {
    return (
      isStepComputable(step) &&
      every(step.components, (c: CephLandmark) => some(
        [c, ...findEqual(imageId)(c)],
        eq => isMapped(imageId)(eq),
      ))
    );
  },
);

/**
 * The step's value straight out of the geometry — linear measurements are
 * still in image pixels here. Not exported: nothing outside this module should
 * mistake a pixel distance for a millimeter one.
 */
const getRawCalculatedValue = createSelector(
  isStepEligibleForComputation,
  getManualLandmarks,
  (isEligible, getManual) =>
    (imageId: string) => (step: CephLandmark): number | undefined => {
      if (!isEligible(imageId)(step)) {
        return undefined;
      }
      return tryCalculate(step, getManual(imageId), {});
    },
);

export const getCalculatedValue = createSelector(
  getRawCalculatedValue,
  getScaleFactor,
  hasScaleFactor,
  (getRaw, getScale, isScaled) =>
    (imageId: string): ((step: CephLandmark) => number | undefined) => (step: CephLandmark) => {
    const value = getRaw(imageId)(step);
    // Linear measurements come out of the geometry in image pixels; when a
    // mm/px calibration is set for the image, convert them to millimeters.
    // Angular values are scale-independent and pass through unchanged.
    //
    // Without a calibration there is no honest millimeter value to report:
    // the raw pixel distance compared against a mm norm would read as a
    // gross deviation (a lip 1 mm behind the E-line showed as "-10.1 mm
    // ***"). Report it as uncalculated instead — `interpret` skips
    // non-numeric values, so the measurement drops out of the summary,
    // report and wigglegram until the image is calibrated.
    if (typeof value === 'number' && step.unit === 'mm') {
      if (!isScaled(imageId)) {
        return undefined;
      }
      return value * getScale(imageId)!;
    }
    return value;
  },
);

/**
 * Whether a step's value is being withheld only for want of an image scale:
 * the geometry already yields a number, but it is a linear measurement and
 * there is no mm/px calibration to express it in millimeters.
 *
 * Deliberately narrower than "is an unscaled mm step" — several `line`
 * landmarks are declared with `unit: 'mm'` yet never produce a value at all
 * (e.g. the pterygoid vertical), and promising those a number once the image
 * is calibrated would be its own small lie.
 */
export const isStepValuePendingScale = createSelector(
  getRawCalculatedValue,
  hasScaleFactor,
  (getRaw, isScaled) => (imageId: string) => (step: CephLandmark): boolean => {
    if (step.unit !== 'mm' || isScaled(imageId)) {
      return false;
    }
    return typeof getRaw(imageId)(step) === 'number';
  },
);

/**
 * Determines whether a landmark that was defined with a `calculate`
 * method has been calculated. Returns true if the landmark does
 * not define a `calculate` method.
 */
export const isStepCalculationComplete = createSelector(
  getCalculatedValue,
  (getValue) => (imageId: string): D => (step: CephLandmark) => {
    if (isStepComputable(step)) {
      return typeof getValue(imageId)(step) !== 'undefined';
    }
    return true;
  },
);

/**
 * Determines whether a landmark has been mapped and/or calculated.
 */
export const isStepComplete = createSelector(
  isStepMappingComplete,
  isStepCalculationComplete,
  (isMapped, isCalculated) => (imageId: string): D => (step: CephLandmark) => {
    return isMapped(imageId)(step) && isCalculated(imageId)(step);
  },
);

export const isStepSkipped = createSelector(
  getSkippedSteps,
  (getSkipped) => (imageId: string): D => (s: CephLandmark) => getSkipped(imageId)[s.symbol] === true,
);

export const getStepStates = createSelector(
  getActiveAnalysisSteps,
  isStepComplete,
  isStepSkipped,
  getExpectedNextManualLandmark,
  (getSteps, isComplete, isSkipped, getNext) => (imageId: string) => {
    const steps = getSteps(imageId);
    const next = getNext(imageId);
    return mapValues(keyBy(steps, s => s.symbol), (s): StepState => {
      if (next !== null && next.symbol === s.symbol) {
        return 'current';
      } else if (isComplete(imageId)(s)) {
        return 'done';
      } else if (isSkipped(imageId)(s)) {
        return 'skipped';
      }
      return 'pending';
    });
  },
);

type E<T> = (s: CephLandmark) => T;
export const getStepState = createSelector(
  getStepStates,
  (getStates) => (imageId: string): E<StepState> => (s: CephLandmark) => getStates(imageId)[s.symbol],
);

/**
 * Get geometrical representation
 */
export const getAllGeoObjects = createSelector(
  getAllPossibleActiveAnalysisSteps,
  getMappedValue,
  getManualLandmarks,
  (getSteps, getMapped, getManual) => (imageId: string) => {
    const steps = getSteps(imageId);
    const fromAnalysis = mapValues(keyBy(steps, s => s.symbol), (s: CephLandmark) => {
      const mapped = getMapped(imageId)(s);
      // A stored *point* under a computed measurement's symbol ('Björk',
      // 'S-Go/N-Me', …) can never be that measurement's honest geometry — it
      // is a stray from an older session that treated computed-only steps as
      // clickable landmarks. Drop it instead of rendering a bogus labeled dot.
      if (s.type !== 'point' && isGeoPoint(mapped)) {
        return undefined;
      }
      return mapped;
    });
    // Also surface manually placed landmarks that the active analysis does not
    // define (e.g. the soft-tissue profile points used by the profilogram), so
    // they render as draggable points instead of being invisible.
    const manual = getManual(imageId);
    const stepsBySymbol = keyBy(steps, s => s.symbol);
    const result: { [symbol: string]: GeoObject | undefined } = { ...fromAnalysis };
    Object.keys(manual).forEach((symbol) => {
      const step = stepsBySymbol[symbol];
      // Same stray-point guard as above: never resurrect a point stored under
      // a computed measurement's symbol.
      if (step !== undefined && step.type !== 'point') {
        return;
      }
      if (result[symbol] === undefined) {
        result[symbol] = manual[symbol];
      }
    });
    return result;
  },
);

/**
 * Determines whether all the components that the active analysis
 * is composed of were mapped and/or calculated.
 */
export const isAnalysisComplete = createSelector(
  getActiveAnalysis,
  isStepComplete,
  (getAnalysis, isComplete) => (imageId: string) => {
    const analysis = getAnalysis(imageId);
    if (analysis !== null) {
      return every(analysis.components, isComplete);
    }
    return false;
  },
);

export const getAllCalculatedValues = createSelector(
  getActiveAnalysisSteps,
  getCalculatedValue,
  (getSteps, getValue) => (imageId: string) => {
    const steps = getSteps(imageId);
    return mapValues(
      keyBy(steps, c => c.symbol),
      c => getValue(imageId)(c),
    );
  },
);

/**
 * The patient these norms are being read against — their age on the day of the
 * film and their recorded sex — so an analysis that carries its author's own
 * age indexing (Ricketts) or sex split (Jacobson's Wits) grades this patient
 * rather than the author's reference child. Empty when nothing is on record,
 * in which case every analysis prints its published figure and says so.
 */
export const getPatientAnalysisContext = createSelector(
  getActivePatient,
  getImageCaptureDate,
  (patient, getCaptureDate) => (imageId: string): AnalysisContext => (
    getAnalysisContext(patient, parseCaptureDate(getCaptureDate(imageId)))
  ),
);

export const getCategorizedAnalysisResults = createSelector(
  getActiveAnalysis,
  getAllCalculatedValues,
  getAllGeoObjects,
  getPatientAnalysisContext,
  (getAnalysis, getValues, getObjects, getContext) =>
    (imageId: string): Array<CategorizedAnalysisResult<Category>> => {
      const analysis = getAnalysis(imageId);
      const objects = getObjects(imageId);
      const values = getValues(imageId);
      if (analysis !== null) {
        return analysis.interpret(values, objects, getContext(imageId));
      }
      return [];
    },
);

/**
 * Warnings the active analysis draws from its own values (see
 * `AnalysisCaveat`) — a misplaced landmark its numbers expose, printed with the
 * rows it affects rather than left for the clinician to infer.
 */
export const getAnalysisCaveats = createSelector(
  getActiveAnalysis,
  getAllCalculatedValues,
  (getAnalysis, getValues) => (imageId: string): AnalysisCaveat[] => {
    const analysis = getAnalysis(imageId);
    if (analysis === null || typeof analysis.caveats !== 'function') {
      return [];
    }
    return analysis.caveats(getValues(imageId));
  },
);

export const canShowSummary = createSelector(
  getCategorizedAnalysisResults,
  (getResults) => (imageId: string) => !isEmpty(getResults(imageId)),
);

/**
 * Whether the active analysis interprets linear (mm) measurements that cannot
 * be reported because the image has no mm/px scale. `getCalculatedValue`
 * suppresses those values, which silently removes their rows from the summary,
 * the printed report and the wigglegram — this drives the footnote that tells
 * the clinician why they are missing and how to get them back.
 */
export const hasUnreportableLinearMeasurements = createSelector(
  getActiveAnalysis,
  isStepValuePendingScale,
  (getAnalysis, isPendingScale) => (imageId: string): boolean => {
    const analysis = getAnalysis(imageId);
    return analysis !== null && some(
      analysis.components,
      (c) => isPendingScale(imageId)(c.landmark),
    );
  },
);
