import flatten from 'lodash/flatten';
import map from 'lodash/map';
import xorWith from 'lodash/xorWith';
import uniqWith from 'lodash/uniqWith';
import uniqBy from 'lodash/uniqBy';
import sum from 'lodash/sum';
import join from 'lodash/join';
import isPlainObject from 'lodash/isPlainObject';
import maxBy from 'lodash/maxBy';
import groupBy from 'lodash/groupBy';
import keyBy from 'lodash/keyBy';
import some from 'lodash/some';
import isUndefined from 'lodash/isUndefined';

import {
  createVectorFromPoints,
  createAngleFromVectors,
  createPerpendicular,
  getSegmentLength,
  calculateAngle,
  radiansToDegrees,
} from 'utils/math';

function getSymbolForAngle(line1: CephLine, line2: CephLine): string {
  const A = line1.components[0]; // N
  const B = line1.components[1]; // S
  const C = line2.components[0]; // N
  const D = line2.components[1]; // A
  if (A.symbol === C.symbol || B.symbol === D.symbol) {
    const uniqArray = uniqBy([B, C, D, A], p => p.symbol);
    return map(uniqArray, c => c.symbol).join('');
  } else {
    return map([line1, line2], c => c.symbol).join(',');
  }
}

const defaultMapAngle: MapLandmark<GeoVector, GeoAngle> =
  (line1: GeoVector, line2: GeoVector) => createAngleFromVectors(line1, line2);

// The angle calculator only ever runs on angle landmarks, so it is safe to
// expose it under the general landmark-calculator type expected by CephLandmark.
const defaultCalculateAngle = (
  () => () => (angle: GeoAngle) =>
    radiansToDegrees(calculateAngle(angle))
) as CalculateLandmark<number, GeoObject, GeoObject>;

const defaultMapLine: MapLandmark<GeoPoint, GeoVector> =
  (A: GeoPoint, B: GeoPoint) => createVectorFromPoints(A, B);

const defaultMapDistance: MapLandmark<GeoObject, GeoVector> =
  (A: GeoPoint, line: GeoVector) => createPerpendicular(line, A);

// Only ever runs on line/distance landmarks; exposed under the general type.
const defaultCalculateLine = (
  () => () => (segment: GeoVector) => getSegmentLength(segment)
) as CalculateLandmark<number, GeoObject, GeoObject>;

const defaultCalculateSum: CalculateLandmark<number, GeoObject, GeoObject> =
  (...values) => () => () => sum(values);

/**
 * Creates an object conforming to the Angle interface based on 2 lines
 */
export function angleBetweenLines(
  lineA: CephLine, lineB: CephLine,
  name?: string, symbol?: string,
  unit: AngularUnit = 'degree',
  imageType: ImageType = 'ceph_lateral',
): CephAngle {
  return {
    type: 'angle',
    symbol: symbol || getSymbolForAngle(lineA, lineB),
    unit,
    name,
    components: [lineA, lineB],
    map: defaultMapAngle,
    calculate: defaultCalculateAngle,
    imageType,
  };
}

/**
 * Creates an object conforming to the Angle interface based on 3 points
 */
export function angleBetweenPoints(
  A: CephPoint, B: CephPoint, C: CephPoint,
  name?: string,
  unit: AngularUnit = 'degree',
): CephAngle {
  return angleBetweenLines(line(B, A), line(B, C), name, undefined, unit);
}

export function point(
  symbol: string, name?: string,
  description?: string,
  imageType: ImageType = 'ceph_lateral',
): CephPoint {
  return {
    type: 'point',
    name,
    symbol,
    description,
    components: [],
    imageType,
  };
}

/**
 * Creates an object conforming to the Line interface connecting two points
 */
export function line(
  A: CephPoint, B: CephPoint,
  name?: string, symbol?: string,
  imageType: ImageType = 'ceph_lateral',
): CephLine {
  return {
    type: 'line',
    name,
    symbol: symbol || `${A.symbol}-${B.symbol}`,
    components: [A, B],
    map: defaultMapLine,
    imageType,
  };
};

export function distance(
  A: CephPoint, line: CephLine,
  name?: string, symbol?: string,
  unit: LinearUnit = 'mm',
  imageType: ImageType = 'ceph_lateral',
): CephDistance {
  return {
    type: 'distance',
    name,
    unit,
    symbol: symbol || `${A.symbol}-${line.symbol}`,
    components: [A, line],
    map: defaultMapDistance,
    calculate: defaultCalculateLine,
    imageType,
  };
};

export function angularSum(
  components: CephAngle[],
  name: string, symbol?: string,
  imageType: ImageType = 'ceph_lateral',
): CephAngularSum {
  return {
    type: 'sum',
    name,
    unit: components[0].unit,
    symbol: symbol || join(map(components, c => c.symbol), '+'),
    components,
    calculate: defaultCalculateSum,
    imageType,
  };
}

/**
 * Creates a new landmark that can be set on the specified image type
 * by copying properties of a landmark defined for a different image type
 * and replacing its components with ones applicable to the new image type.
 * The new landmark has the same symbol and name of the reused one.
 */
export const reuseLandmarkForImageType =
  (imageType: ImageType) =>
    (landmark: CephLandmark): CephLandmark => ({
      ...landmark,
      imageType,
      components: map(
        landmark.components,
        reuseLandmarkForImageType(imageType),
      ),
    });

export function areEqualSteps(l1: CephLandmark, l2: CephLandmark): boolean {
  if (l1.symbol === l2.symbol) {
    return true;
  }
  if (l1.type !== l2.type) {
    return false;
  }
  if (l1.components.length === 0) {
    return false;
  }
  if (l1.components.length !== l2.components.length) {
    return false;
  }
  return (
    xorWith(l1.components, l2.components, areEqualSteps).length === 0
  );
};

export function areEqualSymbols(l1: CephLandmark, l2: CephLandmark) {
  return l1.symbol === l2.symbol;
};

export function getStepsForLandmarks(
  landmarks: CephLandmark[],
  removeEqualSteps = true,
): CephLandmark[] {
  return uniqWith(
    flatten(map(
      landmarks,
      (landmark: CephLandmark) => {
        if (!landmark) {
          console.warn(
            'Got unexpected value in getStepsForLandmarks. ' +
            'Expected a Cephalo.Landmark, got ' + landmark,
          );
          return [];
        }
        return [
          ...getStepsForLandmarks(landmark.components, removeEqualSteps),
          landmark,
        ];
      },
    )),
    removeEqualSteps === true ? areEqualSteps : areEqualSymbols,
  );
};

export function getStepsForAnalysis<T extends ImageType>(
  analysis: Analysis<T>,
  deduplicateVectors = true,
): CephLandmark[] {
  return getStepsForLandmarks(analysis.components.map(c => c.landmark), deduplicateVectors);
};

export function flipVector(vector: CephLine) {
  // The flipped line keeps the original's clinical name (the symbol stays
  // directional — it is the storage key and signed angles depend on the two
  // directions staying distinct). To the person tracing the film both
  // directions are the same physical stroke, and an analysis that happens to
  // declare only the flipped variant used to title its step by the raw
  // endpoint symbol — Steiner read "Draw line L1 Incisal Edge-L1 Apex" four
  // rows from a named "Draw line Upper Incisor Axis".
  return line(vector.components[1], vector.components[0], vector.name);
};

export function isCephPoint(object: any): object is CephPoint {
  return isPlainObject(object) && object.type === 'point';
};

export function isCephLine(object: any): object is CephLine {
  return isPlainObject(object) && object.type === 'line';
};

export function isCephAngle(object: any): object is CephAngle {
  return isPlainObject(object) && object.type === 'angle';
};

/**
 * Tries mapping a CephaloLandmark.
 * Returns the GeoObject the landmark maps to.
 * Returns undefined if the landmark is not mappable.
 */
export function tryMap(
  landmark: CephLandmark,
  manualObjects: Record<string, GeoObject | undefined>,
): GeoObject | undefined {
  const manual = manualObjects[landmark.symbol];
  if (typeof manual !== 'undefined') {
    return manual;
  } else if (typeof landmark.map === 'function') {
    return landmark.map(...map(landmark.components, c => tryMap(c, manualObjects)));
  }
  return undefined;
};

/**
 * Tries calculating the value of a landmark on a cephalometric radiograph.
 * Returns the calculated value as specified in the landmark.calculate method.
 * Returns undefined if the landmark cannot be calculated.
 */
export function tryCalculate(
  landmark: CephLandmark,
  manualObjects: Record<string, GeoObject | undefined>,
  values: Record<string, number | undefined>,
): number | undefined {
  const manualValue = values[landmark.symbol];
  if (typeof manualValue !== 'undefined') {
    return manualValue;
  } else if (typeof landmark.calculate === 'function') {
    return landmark.calculate(
      // The calculated values of this landmark's components
      ...map(landmark.components, c => tryCalculate(c, manualObjects, values)),
    )(
      // The geometrical representation of this landmark's components
      ...map(landmark.components, c => tryMap(c, manualObjects)),
    )(
      // The geometrical representation of this landmark
      tryMap(landmark, manualObjects),
    );
  }
  return undefined;
};

const categoryMap: Record<Category, string> = {
  growthPattern: 'Growth pattern',
  lowerIncisorInclination: 'Lower incisor inclination',
  upperIncisorInclination: 'Upper incisor inclination',
  lowerIncisorPosition: 'Lower incisor position',
  upperIncisorPosition: 'Upper incisor position',
  measurement: 'Measured values',
  mandible: 'Mandible',
  maxilla: 'Maxilla',
  mandibularRotation: 'Mandibular rotation',
  skeletalBite: 'Skeletal bite',
  skeletalPattern: 'Skeletal pattern',
  skeletalProfile: 'Skeletal profile',
  // Tweed's FMA · IMPA · FMIA, read together (see `Categories.tweedTriangle`).
  // Only ever printed under a Tweed heading, so it does not repeat his name.
  tweedTriangle: 'Diagnostic triangle',
  chin: 'Chin prominence',
  // The facial surface's own profile reading, kept apart from the skeletal
  // one — see `Categories.softTissueProfile`.
  softTissueProfile: 'Soft-tissue profile',
  mentolabialSulcus: 'Mentolabial fold',
  lowerLipProminence: 'Lower lip prominence',
  upperLipProminence: 'Upper lip prominence',
  overbite: 'Overbite',
  overjet: 'Overjet',
};

const indicationMap: Record<Indication<Category>, string> = {
  labial: 'Labial',
  class1: 'Class 1',
  class2: 'Class 2',
  class3: 'Class 3',
  clockwise: 'Clockwise',
  closed: 'Closed',
  concave: 'Concave',
  convex: 'Convex',
  counterclockwise: 'Counter-clockwise',
  // The mentolabial fold (see `Categories.mentolabialSulcus`).
  deep: 'Deep',
  shallow: 'Shallow',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  lingual: 'Lingual',
  normal: 'Normal',
  open: 'Open',
  palatal: 'Palatal',
  prognathic: 'Prognathic',
  prominent: 'Prominent',
  recessive: 'Recessive',
  retrognathic: 'Retrognathic',
  tendency_for_class3: 'Class 3 Tendency',
  decreased: 'Decreased',
  increased: 'Increased',
  negative: 'Negative',
  resessive: 'Recessive',
  protrusive: 'Protrusive',
  retrusive: 'Retrusive',
  within_norm: 'Within norm',
  outside_norm: 'Outside norm',
  not_graded: 'No published norm',
};

const severityMap: Record<Severity, string> = {
  low: 'Slight',
  medium: 'Medium',
  high: 'Severe',
  none: 'None',
};

export const getDisplayNameForCategory =
  (category: Category) => categoryMap[category];

export const getDisplayNameForIndication =
  (indication: Indication<Category>) => indicationMap[indication];

export const getDisplayNameForSeverity =
  (severity: Severity) => severityMap[severity];


/**
 * Determines whether a step in a cephalometric analysis can be
 * automatically mapped to a geometrical object
 */
export function isStepAutomatic(step: CephLandmark): boolean {
  return typeof step.map === 'function';
};

/**
 * Determines whether a step in a cephalometric analysis needs to be performed
 * by the user. Only *points* can be placed by hand (or by the auto-plot
 * predictor); computed-only measurements without a `map` (angular sums,
 * ratios, value-only distances such as Björk's sum or S-Go/N-Me) are derived
 * from their components and must never be treated as clickable/plottable
 * landmarks — doing so used to scatter bogus dots labeled with measurement
 * names across the tracing.
 */
export const isStepManual = (step: CephLandmark) =>
  step.type === 'point' && !isStepAutomatic(step);

/**
 * Determines whether a step in a cephalometric analysis can be represented as
 * a geometrical object on the image: points always can (they are placed), and
 * anything with a `map` method can. Computed-only measurements (sums, ratios,
 * mapless distances) have a numeric value but no geometry of their own.
 */
export const isStepMappable = (step: CephLandmark) =>
  step.type === 'point' || typeof step.map === 'function';

/** Determines whether a step in a cephalometric analysis can be computed as a numerical value */
export function isStepComputable(step: CephLandmark) {
  return typeof step.calculate === 'function';
};

/**
 * The norm of a measurement this app reports **without** a published figure to
 * compare it against — Jarabak's absolute facial heights, whose normal values
 * are age- and sex-specific, or Tweed's occlusal-plane and Y-axis readings,
 * which his triangle states descriptively. Spread over the three fields of an
 * `AnalysisComponent` so such a measurement still reaches the Summary and the
 * report as a measured value, while the norm and deviation columns print an
 * em dash instead of a number nobody published.
 *
 * Making up a plausible-looking mean would have been the easy way to fill the
 * column; a clinician reading "N-Me 121 ± 5" cannot tell an invented norm from
 * a real one, so the app says it has none.
 */
export const NO_NORM = { mean: NaN, min: NaN, max: NaN };

/** Whether an analysis component states a norm at all (see `NO_NORM`). */
export const hasNorm = (mean: number, min: number, max: number): boolean => (
  isFinite(mean) && isFinite(min) && isFinite(max)
);

/**
 * Spread into an `AnalysisComponent` whose `min`/`max` are a published normal
 * **range** rather than a mean ± 1 SD band (see `NormBand`). Björk's gonial
 * halves, Jarabak's facial-height ratio and Holdaway's incisor:chin ratio are
 * all quoted this way, and none of their authors published a standard
 * deviation to divide by.
 */
export const RANGE = { band: 'range' as NormBand };

/** Whether a component's min/max are a real ± 1 SD band (see `NormBand`). */
export const isSdBand = (band?: NormBand): boolean => band !== 'range';

/**
 * Standard deviation of a component, or `NaN` when it has none to give: no
 * norm at all, or a norm stated as a range. Every SD-derived reading in the app
 * (the star scale, the wigglegram's z axis, the report's divergence ranking)
 * goes through this so none of them can resurrect `(max - min) / 2` on a range.
 */
export const normSd = (
  mean: number, min: number, max: number, band?: NormBand,
): number => {
  if (!hasNorm(mean, min, max) || !isSdBand(band)) {
    return NaN;
  }
  return (max - min) / 2;
};

/**
 * How far a value falls outside a published range, signed: positive above the
 * upper bound, negative below the lower one, exactly 0 while inside. This is
 * the only "deviation" a range component can honestly report — there is no
 * mean to subtract.
 */
export const rangeExcess = (
  value: number, min: number, max: number,
): number => {
  if (value > max) {
    return value - max;
  }
  if (value < min) {
    return value - min;
  }
  return 0;
};

/**
 * The category that carries measurements without a named clinical label.
 * Exported so the report's cross-analysis machinery can tell a *finding* from
 * a plain measured value.
 */
export const NEUTRAL_CATEGORY: Category = 'measurement';

/**
 * Applies the author's own corrections of a norm to the patient in front of the
 * clinician: a growth correction of the mean (`perYearFrom`) and a sex split
 * (`sexMeans`). The band moves with the mean — the standard deviation is the
 * sample's and the author does not restate it per year — so only the centre
 * shifts and the width is preserved exactly.
 *
 * **Nothing is corrected without a record to correct from.** With no date of
 * birth (or no recorded sex) the published figure is returned untouched, and
 * the analysis' provenance says which of the two documents the reader is
 * holding (see `NormsProvenance.patientNote`). Guessing an age would be worse
 * than printing the uncorrected mean, because the reader cannot tell a guessed
 * norm from a published one.
 */
export const adjustComponentForPatient = (
  component: AnalysisComponent,
  context?: AnalysisContext,
): AnalysisComponent => {
  if (context === undefined) {
    return component;
  }
  const { mean, min, max, perYearFrom, sexMeans } = component;
  if (!isFinite(mean)) {
    return component;
  }
  let corrected = mean;
  if (
    sexMeans !== undefined &&
    (context.sex === 'male' || context.sex === 'female')
  ) {
    corrected = sexMeans[context.sex];
  }
  if (perYearFrom !== undefined && typeof context.ageInYears === 'number') {
    // Clamped at both ends: below the published age the author's own figure
    // stands, and above the end of growth the correction stops (see
    // `NormAgeCorrection.until` — a growth coefficient run into middle age
    // produces norms nobody published).
    const age = Math.min(
      Math.max(context.ageInYears, perYearFrom.age), perYearFrom.until,
    );
    corrected += (age - perYearFrom.age) * perYearFrom.delta;
  }
  if (corrected === mean) {
    return component;
  }
  const shift = corrected - mean;
  return {
    ...component,
    mean: corrected,
    min: min + shift,
    max: max + shift,
  };
};

/** `adjustComponentForPatient` over a whole analysis' component list. */
export const adjustComponentsForPatient = (
  components: AnalysisComponent[],
  context?: AnalysisContext,
): AnalysisComponent[] => (
  context === undefined
    ? components
    : map(components, c => adjustComponentForPatient(c, context))
);

/**
 * Grades a value against its norm range without claiming a diagnosis.
 */
export const gradeAgainstNorm = (
  value: number, min: number, max: number, mean: number,
): Indication<'measurement'> => {
  if (!hasNorm(mean, min, max)) {
    return 'not_graded';
  }
  return (value < min || value > max) ? 'outside_norm' : 'within_norm';
};

/**
 * The order the neutral rows are read in — what left its norm first, then what
 * stayed inside it, then what this app states no norm for at all — and the
 * sub-heading each run of them prints inside the single "Measured values"
 * group. Exported so the Summary table and the printed report label the runs
 * identically.
 */
export const NEUTRAL_GRADE_ORDER: Array<Indication<'measurement'>> = [
  'outside_norm', 'within_norm', 'not_graded',
];

/**
 * The sub-heading over each run of neutral rows. Worded as a statement about
 * the rows under it, not as a chip: "Reported without a published norm" says
 * what the em dashes in the norm and deviation columns mean, which
 * "No published norm" as a group chip never did.
 */
export const NEUTRAL_GRADE_LABELS: {
  [indication: string]: string | undefined;
} = {
  outside_norm: 'Outside the norm',
  within_norm: 'Within the norm',
  not_graded: 'Reported without a published norm',
};

/**
 * Default implementation of Analysis.interpret.
 * Returns the falttened interpretation of each of this analysis components
 * grouped by category and resolves indication and severity with the default
 * resolving strategy.
 *
 * **Every computed component is reported.** A component whose landmark defines
 * an `interpret` function is grouped under the clinical category that function
 * names. A component *without* one used to vanish silently between the stepper
 * and the Summary — Jarabak's saddle, articular and gonial angles were plotted,
 * computed and shown as completed steps, then appeared in no table with a norm.
 * They are now emitted under the neutral `measurement` category: a measured
 * value with a norm is a finding even when it carries no named clinical label,
 * and the alternative (fabricating an interpretation so the row survives) would
 * be dishonest.
 *
 * The neutral rows are emitted as **one group**, ordered by what is actually
 * true of them — what left its norm, what stayed inside it, what this app
 * states no norm for at all — and the tables print a sub-heading over each run
 * (see `NEUTRAL_GRADE_ORDER`). Two things had to be avoided at once. A single
 * chip spanning the whole bucket says things that are plainly untrue of most of
 * its rows: Jarabak printed "Measured values / Outside norm" across N-Me and
 * S-Go, whose norm and deviation cells both read "—" (a row with no norm cannot
 * be outside it). But *one group per indication* printed the same category
 * heading two and three times in one table — "Measured values / Outside norm"
 * then "Measured values / Within norm" — which reads as a bucketing artifact
 * rather than a designed grouping, and buried two of Downs' ten named factors
 * under it. One heading, one group, a sub-rule per grading: the row-level truth
 * survives and the heading is stated once.
 *
 * `context`, when given, corrects each component's mean by the author's own
 * age and sex indexing before anything is graded (see
 * `adjustComponentsForPatient`) — the whole point of the exercise being that
 * Ricketts' age-9 facial depth is not the norm for a 28-year-old.
 */
export const defaultInterpretAnalysis =
  (declaredComponents: AnalysisComponent[]): InterpretAnalysis<Category> => {
    return (values, _objects, context) => {
      const components = adjustComponentsForPatient(declaredComponents, context);
      const measured: Array<LandmarkInterpretation<'measurement'> & {
        symbol: string;
      }> = [];
      const results = flatten(
        map(components, ({
          landmark: { symbol, interpret }, max, min, mean, band, normSource,
        }) => {
          const value = values[symbol];
          if (typeof value !== 'number' || !isFinite(value)) {
            // Not computed (a landmark is still unplaced, or the image carries
            // no scale for a millimetre value). Accounted for by the report's
            // footnotes rather than printed as a blank row.
            return [];
          }
          if (typeof interpret === 'function' && hasNorm(mean, min, max)) {
            return map(
              interpret(value, min, max, mean),
              r => ({ ...r, symbol, band, normSource }),
            );
          }
          measured.push({
            symbol,
            category: NEUTRAL_CATEGORY as 'measurement',
            indication: gradeAgainstNorm(value, min, max, mean),
            value, mean, max, min, band, normSource,
          });
          return [];
        }),
      );

      const interpreted = map(
        groupBy(results, r => r.category),
        (group, category: Category) => ({
          category,
          indication: resolveIndication(group),
          severity: resolveSeverity(group),
          relevantComponents: map(
            group,
            (({ symbol, value, mean, max, min, band, normSource }) => ({
              symbol,
              value,
              mean,
              max,
              min,
              band,
              normSource,
            })),
          ),
        }),
      );

      if (measured.length === 0) {
        return interpreted;
      }

      // One neutral group, its rows ordered by what is actually true of them:
      // what left its norm, what stayed inside it, and what this app states no
      // norm for at all. The tables rule and label each run; the group's own
      // indication is the first run present, so a bucket that is entirely
      // ungraded never advertises itself as graded.
      const ordered = flatten(
        NEUTRAL_GRADE_ORDER.map(
          (indication) => measured.filter(m => m.indication === indication),
        ),
      );
      const neutralGroup = {
        category: NEUTRAL_CATEGORY,
        indication: ordered[0].indication as Indication<Category>,
        severity: 'none' as Severity,
        relevantComponents: map(
          ordered,
          ({ symbol, value, mean, max, min, band, normSource }) => ({
            symbol, value, mean, max, min, band, normSource,
          }),
        ),
      };

      return [...interpreted, neutralGroup];
    };
  };

/**
 * Default implementation of CephLandmark.interpret.
 * Maps a value to one of three possible indications
 * based on the mean, maximum and minimum values.
 * For example, given a category of skeletalPattern and the ranges
 * ['class3', 'class1', 'class2'], the interpretation function should
 * indicate a Class 3 skeletal pattern given a value of -1 for ANB and
 * a mean of 2, min of 0 and maximum of 4.
 */
export function defaultInterpetLandmark<T extends Category>(
  category: T, ranges: [Indication<T>, Indication<T>, Indication<T>],
): InterpretLandmark<T> {
  return (value, min, max, mean) => {
    let indication = ranges[1];
    let severity: Severity = 'none';
    if (value > max) {
      indication = ranges[2];
    } else if (value < min) {
      indication = ranges[0];
    }
    return [{
      category, indication, severity,
      value,
      mean,
      max, min,
    }];
  };
};

/**
 * Creates a landmark interpretation function that calls
 * any number of interpretation functions and returns a array 
 * of interpretations composed of flattening the results of
 * each function call. 
 */
export function composeInterpretation<C extends Category>(
  ...args: Array<InterpretLandmark<C>>
): InterpretLandmark<C> {
  return (value, max, min, mean) => {
    return flatten(map(args, fn => fn(value, max, min, mean)));
  };
};

/**
 * Tries to get the most reasonable indication given contradicting
 * interpretations of the evaluated value of a landmark by returning the
 * most occurring indication.
 *
 * **An even split is broken by the evidence, not by declaration order.** A
 * group whose measurements vote 1–1 used to take whichever indication was
 * *declared first* in the analysis module: Ricketts' growth-pattern chip read
 * "Normal" off a facial axis 0.5 SD inside its band while the mandibular arc
 * sat 4.7 SD out — and flipping the two components' order in `ricketts.ts`
 * would have flipped the chip. Ties now go to the indication backed by the
 * measurement furthest from its norm in standard deviations, which is the same
 * rule the report's divergence note uses to name the measurement that "drives"
 * a finding. A component with no SD to standardize by — no norm, or a norm
 * published as a range (see `normSd`) — scores 0, so a range row can never
 * out-argue a graded one.
 */
export function resolveIndication<C extends Category>(
  results: Array<LandmarkInterpretation<C>>,
): Indication<C> {
  const counts: { [indication: string]: number } = {};
  const strongest: { [indication: string]: number } = {};
  results.forEach((r) => {
    counts[r.indication] = (counts[r.indication] || 0) + 1;
    const sd = normSd(r.mean, r.min, r.max, r.band);
    const z = sd > 0 ? Math.abs(r.value - r.mean) / sd : 0;
    const best = strongest[r.indication];
    if (best === undefined || z > best) {
      strongest[r.indication] = z;
    }
  });
  const pairs = map(
    counts,
    (value, indication: Indication<C>) => ({
      value,
      indication,
    }),
  );
  const max = maxBy(
    pairs,
    // The tie-break term is squashed to (0, 0.001) — monotone in z, so a
    // stronger deviation always argues harder, but never worth a whole vote.
    ({ value, indication }) => {
      const z = strongest[indication];
      return value + z / (1 + z) / 1000;
    },
  );
  return max!.indication;
};

/**
 * Default strategy for resolving conflicting severity values.
 * Tries to get the most reasonable severity value given contradicting
 * interpretations of the evaluated value of a landmark by returning the 
 * most occurring severity value.
 */
export function resolveSeverity<C extends Category>(
  results: Array<LandmarkInterpretation<C>>,
): Severity {
  const counts: { [severity: string]: number } = {};
  results.forEach((r) => {
    if (r.severity !== undefined) {
      counts[r.severity] = (counts[r.severity] || 0) + 1;
    }
  });
  const pairs = map(counts, (value, severity: Severity) => ({ value, severity }));
  const max = maxBy(pairs, ({ value }) => value);
  // A finding whose landmarks all interpret themselves without stating a
  // severity (ANB does) has nothing to resolve. That is 'none', not a crash:
  // it happens whenever such a landmark is the only one in its category, as
  // ANB is in Steiner's analysis.
  return max === undefined ? 'none' : max.severity;
};

export const indexAnalysisResults = <C extends Category>(
  results: Array<CategorizedAnalysisResult<C>>
) => {
  return keyBy(results, 'category') as IndexedAnalysisInterpretation;
};

/** 
 * Given a **topoligcally sorted** list of cephalometric landmarks
 * and a record of manually set landmarks, this function tries 
 * to calculate and map each given landmark taking into account
 * the previous steps.
 */
export const mapAndCalculateSteps = (
  steps: CephLandmark[],
  manualLandmarks: Record<string, GeoObject>,
) => {
  const objects: Record<string, GeoObject | undefined> = { ...manualLandmarks };
  const values: Record<string, number | undefined> = { };
  for (const step of steps) {
    const mapped = map(step.components, c => objects[c.symbol]);
    if (some(mapped, isUndefined)) {
      if (__DEBUG__) {
        const unmapped = step.components
          .map(({ symbol }) => symbol)
          .filter(symbol => isUndefined(objects[symbol]));
        console.warn(
          `Every sub component must be mapped in order to map ${step.symbol}. ` +
          `The following sub components were not mapped: ${unmapped.join(', ')}`,
        );
      }
    } else {
      const calculated = map(step.components, c => values[c.symbol]);
      if (typeof step.map === 'function') {
        objects[step.symbol] = step.map(...mapped);
      }
      if (typeof step.calculate === 'function') {
        values[step.symbol] = step.calculate(...calculated)(...mapped)(objects[step.symbol]);
      }
    }
  }
  return { values, objects };
};
