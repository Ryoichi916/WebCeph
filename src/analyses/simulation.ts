import { isGeoPoint } from 'utils/math';

import {
  LandmarkMap,
  placedPoints,
  buildChangeTable,
  measurementKind,
  ChangeRow,
  MeasurementKind,
} from 'analyses/superimposition';
import { LATERAL_ANALYSES } from 'analyses/lateral';
import { hasNorm, normSd } from 'analyses/helpers';
// The anatomical curves are the editor's own — the very module the tracing is
// drawn with, exactly as `analyses/superimposition` uses it.
import { buildOutlines, Outline } from 'components/TracingViewer/outlines';

/**
 * Treatment simulation (VTO-lite): the geometry of moving parts of a tracing by
 * clinically meaningful amounts, and the measurement comparison that says what
 * those movements would do to the analysis.
 *
 * This module is pure — no store, no DOM, no React — and it is deliberately
 * modest about what it claims:
 *
 *   * Every movement is a **rigid** translation or a rotation about a plotted
 *     landmark. Nothing is remodelled, nothing grows, nothing erupts.
 *   * Linear movements are entered in millimetres, so they exist only on a film
 *     that carries an mm/px calibration. Without one there is no honest way to
 *     turn "5 mm" into pixels, and the linear controls are withheld rather than
 *     silently reinterpreted as pixels. Angular movements (incisor inclination)
 *     are scale-independent and stay available.
 *   * Every reported number comes back through `analyses/superimposition`'s
 *     change table, which runs `analyses/evaluate` — the very path the Summary
 *     dialog and the clinical report take, with the same mm scale rule and the
 *     same suppression of millimetre values on an uncalibrated film. There is no
 *     second implementation of any measurement here.
 *   * The soft-tissue response, when enabled, is an explicit ratio of the
 *     underlying hard-tissue movement, and the ratios are published to the user
 *     (see `SOFT_TISSUE_RESPONSE`). It is not a soft-tissue prediction.
 *
 * A simulation is a planning aid, not a forecast. Nothing in this module is a
 * growth prediction or a surgical outcome prediction.
 */

export interface Vec { x: number; y: number; }

const ZERO: Vec = { x: 0, y: 0 };

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (v: Vec, k: number): Vec => ({ x: v.x * k, y: v.y * k });
const length = (v: Vec): number => Math.hypot(v.x, v.y);

const normalize = (v: Vec): Vec | null => {
  const len = length(v);
  return len > 1e-6 ? { x: v.x / len, y: v.y / len } : null;
};

const midpoint = (a: Vec, b: Vec): Vec => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

type PointMap = { [symbol: string]: GeoPoint };

const has = (points: PointMap, symbols: string[]): boolean =>
  symbols.every((s) => points[s] !== undefined);

const missing = (points: PointMap, symbols: string[]): string[] =>
  symbols.filter((s) => points[s] === undefined);

// ---- Reference planes -------------------------------------------------------

/**
 * The plane a linear movement is measured along. A surgeon does not advance a
 * jaw "to the right"; the movement is stated along an anatomical plane, and the
 * plane has to be named in the UI because it changes what the millimetres mean.
 */
export type ReferenceId = 'occlusal' | 'palatal' | 'facial' | 'frankfort';

export interface Reference {
  id: ReferenceId;
  /** How the UI names the plane. */
  name: string;
  /** Landmarks the plane is built from, for the legend. */
  from: string;
  /**
   * How the UI names the *perpendicular* axis — the one impaction and downgraft
   * run along. Stated positively ("along N–Me", "perpendicular to the palatal
   * plane") so the copy never has to nest one perpendicular inside another.
   */
  upName: string;
  /** Unit vector along the plane, pointing anteriorly. */
  ant: Vec;
  /** Unit vector perpendicular to the plane, pointing superiorly. */
  up: Vec;
}

/** Landmarks each reference plane needs. */
export const REFERENCE_REQUIREMENTS: { [id: string]: string[] } = {
  occlusal: ['U6', 'L6', 'U4', 'L4'],
  palatal: ['PNS', 'ANS'],
  facial: ['N', 'Me'],
  frankfort: ['Po', 'Or'],
};

/** Cranio-caudal unit vector (N → Me), or null when either point is missing. */
const facialDown = (points: PointMap): Vec | null => {
  const n = points['N'];
  const me = points['Me'];
  if (n === undefined || me === undefined) {
    return null;
  }
  return normalize({ x: me.x - n.x, y: me.y - n.y });
};

/**
 * The perpendicular to `ant` that points superiorly. Decided against the
 * cranio-caudal direction of the face when it is known, so the choice survives
 * a film that is not perfectly upright; otherwise against screen-up.
 */
const superiorPerpendicular = (ant: Vec, down: Vec | null): Vec => {
  const a: Vec = { x: -ant.y, y: ant.x };
  const b: Vec = { x: ant.y, y: -ant.x };
  if (down !== null) {
    return (a.x * down.x + a.y * down.y) < 0 ? a : b;
  }
  return a.y < 0 ? a : b;
};

const buildReference = (
  points: PointMap, id: ReferenceId,
): Reference | null => {
  if (!has(points, REFERENCE_REQUIREMENTS[id])) {
    return null;
  }
  const down = facialDown(points);
  if (id === 'occlusal') {
    // The functional occlusal plane as the app already defines it: the molar
    // cusp centre (posterior) to the premolar cusp centre (anterior). See
    // analyses/landmarks/lines/dental#functionalOcclusalPlane.
    const c6 = midpoint(points['U6'], points['L6']);
    const c4 = midpoint(points['U4'], points['L4']);
    const ant = normalize({ x: c4.x - c6.x, y: c4.y - c6.y });
    if (ant === null) {
      return null;
    }
    return {
      id, ant, up: superiorPerpendicular(ant, down),
      name: 'functional occlusal plane',
      from: 'molar cusp centre → premolar cusp centre',
      upName: 'perpendicular to that plane',
    };
  }
  if (id === 'palatal') {
    const pns = points['PNS'];
    const ans = points['ANS'];
    const ant = normalize({ x: ans.x - pns.x, y: ans.y - pns.y });
    if (ant === null) {
      return null;
    }
    return {
      id, ant, up: superiorPerpendicular(ant, down),
      name: 'palatal plane',
      from: 'PNS → ANS',
      upName: 'perpendicular to that plane',
    };
  }
  if (id === 'frankfort') {
    // Po → Or, the same convention as the FH construction line (see
    // analyses/landmarks/lines/skeletal#FH). Tweed's own diagnostic triangle
    // is built on this plane — it is the FMPA/IMPA/FMIA of "FMPA" — and its
    // step list plots Po and Or before anything else, so this is the one
    // reference a Tweed-only tracing can always supply.
    const po = points['Po'];
    const or = points['Or'];
    const ant = normalize({ x: or.x - po.x, y: or.y - po.y });
    if (ant === null) {
      return null;
    }
    return {
      id, ant, up: superiorPerpendicular(ant, down),
      name: 'Frankfort horizontal plane',
      from: 'Po → Or',
      upName: 'perpendicular to that plane',
    };
  }
  if (down === null) {
    return null;
  }
  // The anterior axis of the fallback reference is the perpendicular to N–Me —
  // the same facial frame the outline module places synthesised points in.
  //
  // It is deliberately *not* called the "facial line": in cephalometrics that
  // name belongs to N–Pog, which this is not. Naming it "the N–Me
  // perpendicular" leaves the established term free and lets the perpendicular
  // axis be stated positively, as running along N–Me itself.
  const ant: Vec = { x: down.y, y: -down.x };
  return {
    id, ant, up: superiorPerpendicular(ant, down),
    name: 'N–Me perpendicular',
    from: 'N and Me',
    upName: 'along N–Me',
  };
};

/**
 * The planes this tracing would measure each movement along, whether or not a
 * movement has been entered yet.
 *
 * The UI needs these *before* the first drag: naming the plane only once a
 * slider has been moved means the reader cannot learn what a millimetre here
 * means without first mutating the plan, and it makes the panel and the legend
 * grow by a line at the moment of interaction.
 */
export const planReferences = (
  map: LandmarkMap,
): {
  mandible: Reference | null;
  maxilla: Reference | null;
  incisor: Reference | null;
} => {
  const points = placedPoints(map);
  return {
    mandible: getReference(points, MANDIBLE_REFERENCE),
    maxilla: getReference(points, MAXILLA_REFERENCE),
    incisor: getReference(points, INCISOR_REFERENCE),
  };
};

/** The first of the listed planes this tracing can supply. */
export const getReference = (
  points: PointMap, preference: ReferenceId[],
): Reference | null => {
  for (const id of preference) {
    const reference = buildReference(points, id);
    if (reference !== null) {
      return reference;
    }
  }
  return null;
};

/**
 * Mandibular movement is stated along the occlusal plane (that is where the
 * occlusion it is meant to correct lives); the maxilla along the palatal plane,
 * which is the Le Fort I convention. Both fall back to the N–Me perpendicular,
 * and then to the Frankfort horizontal (Po → Or) — the plane a Tweed-only
 * tracing can still supply when neither of the first two is plotted. The UI
 * always names the plane actually used.
 */
const MANDIBLE_REFERENCE: ReferenceId[] = ['occlusal', 'palatal', 'facial', 'frankfort'];
const MAXILLA_REFERENCE: ReferenceId[] = ['palatal', 'facial', 'frankfort'];
/**
 * Incisor tipping needs no plane of its own — only a consistent *anterior*, so
 * that "proclination" tips the crown toward the face whichever way the film is
 * hung. Any of the four planes supplies one.
 */
const INCISOR_REFERENCE: ReferenceId[] = ['palatal', 'facial', 'occlusal', 'frankfort'];

// ---- Landmark groups --------------------------------------------------------

/**
 * The mandible, moved as one rigid body. Articulare is deliberately *not* in
 * the group: the condyle stays in its fossa, so an advancement lengthens the
 * Ar–Go segment exactly as the osteotomy gap does. The lower dentition travels
 * with the jaw that carries it.
 */
export const MANDIBLE_GROUP: string[] = [
  'B', 'Pog', 'Gn', 'Me', 'Go', 'PM',
  'R1-mandible', 'R2-mandible', 'R3-mandible', 'R4-mandible',
  'L1 Apex', 'L1 Incisal Edge', 'L4', 'L6',
];

/** Landmarks without which a mandibular movement cannot be drawn. */
export const MANDIBLE_REQUIRED: string[] = ['B', 'Pog', 'Gn', 'Me', 'Go'];

/**
 * The maxilla, moved as one rigid body — the Le Fort I segment: the anterior
 * and posterior nasal spines, A point and the upper dentition.
 */
export const MAXILLA_GROUP: string[] = [
  'ANS', 'PNS', 'A', 'U1 Apex', 'U1 Incisal Edge', 'U4', 'U6',
];

export const MAXILLA_REQUIRED: string[] = ['ANS', 'A'];

export const UPPER_INCISOR_REQUIRED: string[] = ['U1 Apex', 'U1 Incisal Edge'];
export const LOWER_INCISOR_REQUIRED: string[] = ['L1 Apex', 'L1 Incisal Edge'];

// ---- Soft-tissue response ---------------------------------------------------

/**
 * How far each soft-tissue landmark follows the hard tissue underneath it, as a
 * fraction of that hard-tissue movement.
 *
 * These are mean ratios from the orthognathic and incisor-retraction
 * soft-tissue literature, rounded to one decimal. They are means of wide
 * distributions — individual response varies by roughly ±0.3 — so they are
 * published here and printed in the UI rather than hidden inside the drawing
 * code. Lip thickness change, lip strain, muscle adaptation and post-operative
 * relapse are not modelled at all.
 *
 * Glabella and soft-tissue nasion are absent on purpose: they overlie the
 * cranium and the nasal bones, which nothing in this simulation moves.
 *
 * `u1` / `l1` are applied to the incisor's *own* movement — the rotational
 * incisal-edge delta of a tipping plus any bodily translation entered on the
 * incisor's own control — and never to the jaw translation the incisor merely
 * rides with, which the `maxilla` / `mandible` columns already carry:
 * otherwise the lips would be moved twice. The published retraction ratios
 * are stated per unit of incisor movement regardless of whether it was
 * achieved by tipping or bodily mechanics, so one column serves both.
 */
export interface SoftTissueRatio {
  symbol: string;
  name: string;
  maxilla: number;
  mandible: number;
  u1: number;
  l1: number;
}

export const SOFT_TISSUE_RESPONSE: SoftTissueRatio[] = [
  { symbol: 'Pn', name: 'Pronasale', maxilla: 0.2, mandible: 0, u1: 0, l1: 0 },
  { symbol: 'Sn', name: 'Subnasale', maxilla: 0.6, mandible: 0, u1: 0, l1: 0 },
  { symbol: 'Sls', name: 'Superior labial sulcus', maxilla: 0.6, mandible: 0, u1: 0.3, l1: 0 },
  { symbol: 'Ls', name: 'Upper lip (labrale superius)', maxilla: 0.6, mandible: 0, u1: 0.4, l1: 0 },
  { symbol: 'Sts', name: 'Stomion superius', maxilla: 0.6, mandible: 0, u1: 0.4, l1: 0 },
  { symbol: 'Sti', name: 'Stomion inferius', maxilla: 0, mandible: 0.5, u1: 0, l1: 0.4 },
  { symbol: 'Li', name: 'Lower lip (labrale inferius)', maxilla: 0, mandible: 0.6, u1: 0, l1: 0.4 },
  { symbol: 'Ils', name: 'Inferior labial sulcus', maxilla: 0, mandible: 0.7, u1: 0, l1: 0.2 },
  { symbol: 'Pog\'', name: 'Soft-tissue pogonion', maxilla: 0, mandible: 0.9, u1: 0, l1: 0 },
  { symbol: 'Me\'', name: 'Soft-tissue menton', maxilla: 0, mandible: 1, u1: 0, l1: 0 },
];

/** One driver's share of a soft-tissue landmark's movement. */
export interface SoftTissueDriver {
  /** How the UI names the movement driving this share. */
  driver: string;
  /** The published fraction applied to it. */
  value: number;
}

export interface SoftTissueContribution {
  ratio: SoftTissueRatio;
  /**
   * *Every* driver contributing to this landmark under the current plan, not
   * just the largest. A lip sitting over an advanced maxilla and a retracted
   * upper incisor is moved by both, and the disclosure list would understate
   * the simulated movement if it named only one.
   */
  drivers: SoftTissueDriver[];
}

/** The ratios actually in play for a given plan, for the UI's disclosure list. */
export const activeSoftTissueRatios = (
  plan: SimulationPlan,
): SoftTissueContribution[] => {
  const rows: SoftTissueContribution[] = [];
  SOFT_TISSUE_RESPONSE.forEach((ratio) => {
    const drivers: SoftTissueDriver[] = [];
    if ((plan.maxillaMm !== 0 || plan.impactionMm !== 0) && ratio.maxilla > 0) {
      drivers.push({ driver: 'maxilla', value: ratio.maxilla });
    }
    if (plan.mandibleMm !== 0 && ratio.mandible > 0) {
      drivers.push({ driver: 'mandible', value: ratio.mandible });
    }
    if ((plan.u1Deg !== 0 || plan.u1Mm !== 0) && ratio.u1 > 0) {
      drivers.push({ driver: 'upper incisor', value: ratio.u1 });
    }
    if ((plan.l1Deg !== 0 || plan.l1Mm !== 0) && ratio.l1 > 0) {
      drivers.push({ driver: 'lower incisor', value: ratio.l1 });
    }
    if (drivers.length > 0) {
      rows.push({ ratio, drivers });
    }
  });
  return rows;
};

// ---- The plan ---------------------------------------------------------------

export interface SimulationPlan {
  /** Mandibular advancement (+) / setback (−), mm along the occlusal plane. */
  mandibleMm: number;
  /** Maxillary advancement (+) / setback (−), mm along the palatal plane. */
  maxillaMm: number;
  /** Maxillary impaction (+) / downgraft (−), mm perpendicular to that plane. */
  impactionMm: number;
  /** Upper-incisor proclination (+) / retraction (−), degrees about U1 Apex. */
  u1Deg: number;
  /** Lower-incisor proclination (+) / retroclination (−), degrees about L1 Apex. */
  l1Deg: number;
  /** Upper-incisor bodily advancement (+) / retraction (−), mm, apex and edge together. */
  u1Mm: number;
  /** Lower-incisor bodily advancement (+) / retraction (−), mm, apex and edge together. */
  l1Mm: number;
  /** Whether the soft-tissue profile follows, at the published ratios. */
  isSoftTissueFollowing: boolean;
}

export const EMPTY_PLAN: SimulationPlan = {
  mandibleMm: 0,
  maxillaMm: 0,
  impactionMm: 0,
  u1Deg: 0,
  l1Deg: 0,
  u1Mm: 0,
  l1Mm: 0,
  isSoftTissueFollowing: true,
};

export const isPlanEmpty = (plan: SimulationPlan): boolean => (
  plan.mandibleMm === 0 && plan.maxillaMm === 0 && plan.impactionMm === 0 &&
  plan.u1Deg === 0 && plan.l1Deg === 0 &&
  plan.u1Mm === 0 && plan.l1Mm === 0
);

/** Stable key for memoizing a simulation across re-renders. */
export const planKey = (plan: SimulationPlan): string => [
  plan.mandibleMm, plan.maxillaMm, plan.impactionMm,
  plan.u1Deg, plan.l1Deg, plan.u1Mm, plan.l1Mm,
  plan.isSoftTissueFollowing ? 1 : 0,
].join('|');

// ---- Controls ---------------------------------------------------------------

export type ControlId =
  | 'mandible' | 'maxilla' | 'impaction'
  | 'u1' | 'l1' | 'u1Mm' | 'l1Mm';

export interface ControlSpec {
  id: ControlId;
  /** Slider label. */
  label: string;
  /**
   * The structure alone, without the direction the label may already carry
   * ("Maxilla", not "Maxilla — impaction"). The plan chip pairs this with the
   * movement, so it reads "Maxilla: 6.0 mm impaction" instead of stuttering
   * "Maxilla — impaction: 6.0 mm impaction".
   */
  noun: string;
  /** What the two directions are called, negative first. */
  negative: string;
  positive: string;
  unit: 'mm' | '°';
  min: number;
  max: number;
  step: number;
  /** Landmarks the movement needs. */
  required: string[];
  /**
   * Reference planes this movement can be measured along, best first. A
   * movement whose landmarks are all plotted still has no meaning without one
   * of these, so the control must check it rather than move nothing.
   */
  referencePreference: ReferenceId[];
  /** True for movements expressed in millimetres, which need a calibration. */
  isLinear: boolean;
  /** One sentence on what is actually moved, shown as the control's help text. */
  description: string;
  /**
   * The same fact in **one line**, shown under *every* control at rest — a panel
   * of five unexplained sliders whose only documentation appears once you have
   * already moved one is not a panel a clinician can read before acting.
   *
   * One line means one line: at the panel's width these ran to two and three
   * each, and five of them came to a paragraph of grey between the reader and
   * the measurements. The full `description`, and the plane the millimetres are
   * measured along, stay on the control's tooltip.
   */
  short: string;
}

export const SIMULATION_CONTROLS: ControlSpec[] = [
  {
    id: 'mandible',
    label: 'Mandible',
    noun: 'Mandible',
    negative: 'setback', positive: 'advancement',
    unit: 'mm', min: -10, max: 10, step: 0.5,
    required: MANDIBLE_REQUIRED,
    referencePreference: MANDIBLE_REFERENCE,
    isLinear: true,
    description:
      'Translates B, Pogonion, Gnathion, Menton, Gonion and the lower ' +
      'dentition as one rigid body. Articulare is held, so the condyle stays ' +
      'in its fossa.',
    short: 'Moves the mandible and lower dentition as one rigid body.',
  },
  {
    id: 'maxilla',
    label: 'Maxilla — advancement',
    noun: 'Maxilla',
    negative: 'setback', positive: 'advancement',
    unit: 'mm', min: -8, max: 8, step: 0.5,
    required: MAXILLA_REQUIRED,
    referencePreference: MAXILLA_REFERENCE,
    isLinear: true,
    description:
      'Translates ANS, PNS, A point and the upper dentition as one rigid ' +
      'body — the Le Fort I segment.',
    short: 'Moves the Le Fort I segment forward or back as one body.',
  },
  {
    id: 'impaction',
    label: 'Maxilla — impaction',
    noun: 'Maxilla',
    negative: 'downgraft', positive: 'impaction',
    unit: 'mm', min: -6, max: 6, step: 0.5,
    required: MAXILLA_REQUIRED,
    referencePreference: MAXILLA_REFERENCE,
    isLinear: true,
    description:
      'Moves the same segment vertically: impaction lifts it superiorly, ' +
      'downgraft lowers it inferiorly. The mandible does not autorotate — ' +
      'that is a separate movement this app does not model.',
    short: 'Raises or lowers the same segment; no autorotation.',
  },
  {
    id: 'u1',
    label: 'Upper incisor — inclination',
    noun: 'Upper incisor',
    negative: 'retraction', positive: 'proclination',
    unit: '°', min: -15, max: 15, step: 1,
    required: UPPER_INCISOR_REQUIRED,
    referencePreference: INCISOR_REFERENCE,
    isLinear: false,
    description:
      'Tips the incisal edge about the U1 root apex, which is held. This is ' +
      'crown tipping, not bodily retraction, and no space closure is implied.',
    short: 'Tips the upper incisal edge about its apex; tipping only.',
  },
  {
    id: 'u1Mm',
    label: 'Upper incisor — bodily',
    noun: 'Upper incisor',
    negative: 'retraction', positive: 'advancement',
    unit: 'mm', min: -8, max: 8, step: 0.5,
    required: UPPER_INCISOR_REQUIRED,
    referencePreference: INCISOR_REFERENCE,
    isLinear: true,
    description:
      'Translates the whole upper incisor — apex and incisal edge together — ' +
      'along the anterior axis: bodily movement into extraction or stripping ' +
      'space. The posterior dentition is held; no anchorage loss is modelled.',
    short: 'Moves the whole upper incisor bodily; molars are held.',
  },
  {
    id: 'l1',
    label: 'Lower incisor — inclination',
    noun: 'Lower incisor',
    negative: 'retroclination', positive: 'proclination',
    unit: '°', min: -15, max: 15, step: 1,
    required: LOWER_INCISOR_REQUIRED,
    referencePreference: INCISOR_REFERENCE,
    isLinear: false,
    description:
      'Tips the incisal edge about the L1 root apex, which is held. Crown ' +
      'tipping only.',
    short: 'Tips the lower incisal edge about its apex; tipping only.',
  },
  {
    id: 'l1Mm',
    label: 'Lower incisor — bodily',
    noun: 'Lower incisor',
    negative: 'retraction', positive: 'advancement',
    unit: 'mm', min: -8, max: 8, step: 0.5,
    required: LOWER_INCISOR_REQUIRED,
    referencePreference: INCISOR_REFERENCE,
    isLinear: true,
    description:
      'Translates the whole lower incisor — apex and incisal edge together — ' +
      'along the anterior axis: bodily movement into extraction or stripping ' +
      'space. The posterior dentition is held; no anchorage loss is modelled.',
    short: 'Moves the whole lower incisor bodily; molars are held.',
  },
];

/**
 * How far the *largest possible* plan could move any landmark, in image pixels.
 *
 * The figure's frame is computed once from the plotted tracing and then padded
 * by this, so the camera cannot zoom or pan while a slider is dragged: a
 * before/after comparison read off a moving frame is not a comparison. Linear
 * travel needs the calibration (without one no linear control is available, so
 * it contributes nothing); incisor travel is the chord swept by the incisal
 * edge about its apex at full rotation, which is scale-independent.
 */
export const maxSimulatedTravelPx = (
  map: LandmarkMap, scaleFactor: number | null,
): number => {
  const points = placedPoints(map);
  const hasScale = scaleFactor !== null && scaleFactor > 0;
  const mm = (id: ControlId): number => {
    const spec = SIMULATION_CONTROLS.filter((s) => s.id === id)[0];
    return spec !== undefined ? Math.max(Math.abs(spec.min), spec.max) : 0;
  };
  // The maxilla can take an advancement and an impaction at once, and they
  // are perpendicular, so its worst case is the hypotenuse.
  const maxillaPx = hasScale
    ? Math.hypot(mm('maxilla'), mm('impaction')) / scaleFactor!
    : 0;
  const mandiblePx = hasScale ? mm('mandible') / scaleFactor! : 0;
  let travel = Math.max(maxillaPx, mandiblePx);
  [
    ['U1 Apex', 'U1 Incisal Edge', 'u1', 'u1Mm'],
    ['L1 Apex', 'L1 Incisal Edge', 'l1', 'l1Mm'],
  ]
    .forEach(([apexSymbol, edgeSymbol, tipId, bodilyId]) => {
      const apex = points[apexSymbol];
      const edge = points[edgeSymbol];
      const spec = SIMULATION_CONTROLS.filter((s) => s.id === tipId)[0];
      if (apex === undefined || edge === undefined || spec === undefined) {
        return;
      }
      const axis = Math.hypot(edge.x - apex.x, edge.y - apex.y);
      const deg = Math.max(Math.abs(spec.min), spec.max);
      // The incisal edge's movements are ADDITIVE, not alternatives: the
      // incisor rides its jaw, tips, and translates bodily all in one plan,
      // so its worst case is the carrying jaw's travel plus the swept chord
      // plus the full bodily translation (the mm terms are zero when
      // uncalibrated — every linear control is withheld without a scale).
      const bodilySpec = SIMULATION_CONTROLS.filter((s) => s.id === bodilyId)[0];
      const bodilyPx = hasScale && bodilySpec !== undefined
        ? Math.max(Math.abs(bodilySpec.min), bodilySpec.max) / scaleFactor!
        : 0;
      const jawPx = tipId === 'u1' ? maxillaPx : mandiblePx;
      travel = Math.max(
        travel,
        jawPx + 2 * axis * Math.sin((deg * Math.PI / 180) / 2) + bodilyPx,
      );
    });
  return travel;
};

export interface ControlAvailability {
  spec: ControlSpec;
  isAvailable: boolean;
  /** Landmarks this control is waiting on. */
  missingSymbols: string[];
  /** True when the only obstacle is the absent mm/px calibration. */
  needsScale: boolean;
  /**
   * True when the movement's own landmarks are all plotted but no reference
   * plane it can be measured along exists. Without this the slider would be
   * enabled and move nothing at all.
   */
  needsReference: boolean;
  /** The sentence a disabled control shows instead of graying out silently. */
  reason: string | null;
}

/** "PNS and ANS, or N and Menton" — the planes a control could be built on. */
const describeReferenceOptions = (preference: ReferenceId[]): string =>
  preference
    .map((id) => REFERENCE_REQUIREMENTS[id].join(' and '))
    .join(', or ');

export const describeControls = (
  map: LandmarkMap, scaleFactor: number | null,
): ControlAvailability[] => {
  const points = placedPoints(map);
  const hasScale = scaleFactor !== null && scaleFactor > 0;
  return SIMULATION_CONTROLS.map((spec) => {
    const missingSymbols = missing(points, spec.required);
    const needsScale = spec.isLinear && !hasScale;
    // A movement is stated *along* a plane. If the tracing supplies none of the
    // planes this movement accepts, the slider has nothing to move along and is
    // withheld — an enabled slider that silently does nothing would be worse
    // than a disabled one that says why.
    const needsReference =
      missingSymbols.length === 0 &&
      getReference(points, spec.referencePreference) === null;
    const isAvailable =
      missingSymbols.length === 0 && !needsScale && !needsReference;
    let reason: string | null = null;
    if (missingSymbols.length > 0) {
      reason =
        `${spec.label} needs ${missingSymbols.join(', ')} — plot ` +
        `${missingSymbols.length === 1 ? 'it' : 'them'} from the analysis’ ` +
        'step list first, or switch to an analysis that includes ' +
        `${missingSymbols.length === 1 ? 'it' : 'them'} and the points are ` +
        'plotted for you.';
    } else if (needsReference) {
      reason =
        `${spec.label} has to be measured against an anatomical plane, and ` +
        'this tracing supplies none that this movement accepts. Plot ' +
        `${describeReferenceOptions(spec.referencePreference)}.`;
    } else if (needsScale) {
      reason =
        'A millimetre movement needs an mm/px calibration for this film. ' +
        'Set it from the calibration chip in the toolbar; angular movements ' +
        'are scale-independent and stay available.';
    }
    return {
      spec, isAvailable, missingSymbols, needsScale, needsReference, reason,
    };
  });
};

/** True when nothing is available and the calibration is part of the reason. */
const blockedByScale = (controls: ControlAvailability[]): boolean =>
  controls.every((c) => c.needsScale || c.missingSymbols.length > 0);

/** Whether the "Simulate" action is available, and why not when it is not. */
export interface SimulationReadiness {
  canSimulate: boolean;
  reason: string;
}

/** Any reference plane at all — the widest preference order this app has. */
const ANY_REFERENCE: ReferenceId[] = ['occlusal', 'palatal', 'facial', 'frankfort'];

export const getSimulationReadiness = (
  map: LandmarkMap, scaleFactor: number | null,
): SimulationReadiness => {
  const points = placedPoints(map);
  const controls = describeControls(map, scaleFactor);
  const available = controls.filter((c) => c.isAvailable);
  // Something has to anchor the anterior direction, or no movement has a
  // meaning; and at least one movement has to be possible.
  const reference = getReference(points, ANY_REFERENCE);
  if (reference !== null && available.length > 0) {
    return {
      canSimulate: true,
      reason:
        'Simulate a treatment plan on this tracing — geometric only, ' +
        'nothing is saved',
    };
  }
  if (reference === null) {
    // Some analyses plot every landmark a movement needs except the ones a
    // *plane* is built from, so a clinician who works through the step list
    // exactly as asked still finds every reference plane absent — Tweed used
    // to be the standing example of this until Frankfort horizontal (Po →
    // Or, Tweed's own first two points) was added as a fourth option below.
    // Naming a landmark to plot is only half the remedy on a tracing like
    // that: the other half, stated explicitly rather than left for the
    // reader to infer, is that switching to an analysis which already plots
    // one of these planes is enough — the landmark lives on the tracing, not
    // on the analysis, so it carries over untouched and nothing already
    // plotted is lost.
    return {
      canSimulate: false,
      reason:
        'A simulation needs an anatomical reference plane. Plot ' +
        `${describeReferenceOptions(ANY_REFERENCE)} — or switch to an ` +
        'analysis that already plots one of these, and the point carries ' +
        'over: Simulate becomes available either way.',
    };
  }
  // Every movement blocked, and at least one of them only for want of the plane
  // it would be measured along: name that, rather than a landmark list that is
  // already satisfied.
  const blockedByReference = controls.find((c) => c.needsReference);
  if (blockedByReference !== undefined && blockedByScale(controls) === false) {
    return {
      canSimulate: false,
      reason: blockedByReference.reason !== null
        ? blockedByReference.reason
        : 'No movement on this tracing has a reference plane to be measured ' +
          'along yet.',
    };
  }
  if (
    blockedByScale(controls) &&
    controls.some((c) => c.needsScale && c.missingSymbols.length === 0)
  ) {
    return {
      canSimulate: false,
      reason:
        'The skeletal and bodily incisor movements are entered in ' +
        'millimetres, so this film needs an mm/px calibration, and no ' +
        'incisor landmarks are plotted yet. Calibrate from the toolbar ' +
        'chip, or plot the incisors for the angular inclination controls.',
    };
  }
  return {
    canSimulate: false,
    reason:
      'No movement can be simulated on this tracing yet. The mandible needs ' +
      `${MANDIBLE_REQUIRED.join(', ')}; the maxilla needs ` +
      `${MAXILLA_REQUIRED.join(', ')}; the incisors need their edge and apex.`,
  };
};

// ---- Applying a plan --------------------------------------------------------

/**
 * The hard-tissue landmarks the *synthesised* soft-tissue silhouette hangs off
 * (see `components/TracingViewer/outlines`), and the soft-tissue landmark each
 * one stands in for.
 *
 * This mapping exists because of an honesty problem in the figure. When a
 * tracing lacks the full soft-tissue landmark set, the outline module infers the
 * profile from the skeletal points — so if the simulated profile were drawn from
 * the moved skeleton it would follow the bone 1 : 1, contradicting the response
 * ratios published two panels below it, and it would move even with the response
 * switched off. Building that curve from a map whose anchors carry the
 * *soft-tissue* displacement instead makes the drawn silhouette obey exactly the
 * ratios the panel declares, and holds it perfectly still when the response is
 * held. `N` has no soft-tissue counterpart in the ratio table and nothing here
 * moves the cranium, so it stays where it was plotted.
 */
export const PROFILE_ANCHORS: Array<{ anchor: string; standsFor: string }> = [
  { anchor: 'ANS', standsFor: 'Sn' },
  { anchor: 'A', standsFor: 'Ls' },
  { anchor: 'B', standsFor: 'Li' },
  { anchor: 'Pog', standsFor: 'Pog\'' },
  { anchor: 'Me', standsFor: 'Me\'' },
];

export interface Simulation {
  /** The simulated landmark map — a copy; the input is never touched. */
  landmarks: LandmarkMap;
  /**
   * The map the soft-tissue profile curve must be drawn from: soft-tissue
   * landmarks at their simulated positions, and the hard-tissue anchors of a
   * synthesised silhouette displaced by the soft-tissue ratio of the point they
   * stand in for rather than by the full skeletal movement. Every other
   * landmark sits where it was plotted, so nothing but the profile can be drawn
   * from this map. See `PROFILE_ANCHORS`.
   */
  profileLandmarks: LandmarkMap;
  /** Displacement of every moved landmark, in image pixels. */
  displacements: { [symbol: string]: Vec };
  /** Symbols actually moved by a visible amount. */
  movedSymbols: string[];
  /** Plane the mandibular movement was measured along, when one was applied. */
  mandibleReference: Reference | null;
  /** Plane the maxillary movement was measured along, when one was applied. */
  maxillaReference: Reference | null;
  /** Whether millimetre movements were possible at all. */
  hasScale: boolean;
  /** Soft-tissue landmarks this plan moved. */
  softTissueSymbols: string[];
  /**
   * The ratio-weighted soft-tissue displacement of *every* symbol in
   * `SOFT_TISSUE_RESPONSE`, plotted or not, in image pixels — the same
   * vectors `profileLandmarks` was built from. Empty when the response is
   * held — a missing entry reads as zero. Consumed by the photo-morph
   * preview, which needs the displacement per soft-tissue point rather
   * than a rebuilt landmark map.
   */
  softVectors: { [symbol: string]: Vec };
}

/**
 * Rotates `v` by `deg` in the sense that moves its tip *anteriorly* when `deg`
 * is positive — i.e. proclination for either incisor, whichever way round the
 * film is and whichever way the axis happens to point.
 *
 * The sense is decided from the derivative of the tip's anterior projection at
 * zero rotation: d/dφ ((R_φ v)·ant) = (−v.y, v.x)·ant.
 */
const rotateAnteriorly = (v: Vec, deg: number, ant: Vec): Vec => {
  const sense = ((-v.y) * ant.x + v.x * ant.y) >= 0 ? 1 : -1;
  const phi = (deg * Math.PI / 180) * sense;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
};

/** Below this many pixels a "movement" is not worth drawing or listing. */
const VISIBLE_PX = 0.25;

export const applySimulation = (
  map: LandmarkMap,
  plan: SimulationPlan,
  scaleFactor: number | null,
): Simulation => {
  const points = placedPoints(map);
  const hasScale = scaleFactor !== null && scaleFactor > 0;
  // mm → px: the calibration is millimetres *per* pixel.
  const toPx = (mm: number): number => (hasScale ? mm / scaleFactor! : 0);

  const displacements: { [symbol: string]: Vec } = {};
  const shift = (symbol: string, v: Vec) => {
    if (points[symbol] === undefined) {
      return;
    }
    displacements[symbol] = add(
      displacements[symbol] !== undefined ? displacements[symbol] : ZERO, v,
    );
  };

  // --- skeletal translations ------------------------------------------------
  let mandibleReference: Reference | null = null;
  let vMandible: Vec = ZERO;
  if (plan.mandibleMm !== 0 && hasScale && has(points, MANDIBLE_REQUIRED)) {
    mandibleReference = getReference(points, MANDIBLE_REFERENCE);
    if (mandibleReference !== null) {
      vMandible = scale(mandibleReference.ant, toPx(plan.mandibleMm));
      MANDIBLE_GROUP.forEach((symbol) => shift(symbol, vMandible));
    }
  }

  let maxillaReference: Reference | null = null;
  let vMaxilla: Vec = ZERO;
  if (
    (plan.maxillaMm !== 0 || plan.impactionMm !== 0) &&
    hasScale && has(points, MAXILLA_REQUIRED)
  ) {
    maxillaReference = getReference(points, MAXILLA_REFERENCE);
    if (maxillaReference !== null) {
      vMaxilla = add(
        scale(maxillaReference.ant, toPx(plan.maxillaMm)),
        scale(maxillaReference.up, toPx(plan.impactionMm)),
      );
      MAXILLA_GROUP.forEach((symbol) => shift(symbol, vMaxilla));
    }
  }

  // --- incisor tipping ------------------------------------------------------
  // The anterior direction only has to be *a* consistent anterior; any of the
  // reference planes gives one.
  const anteriorRef = getReference(points, INCISOR_REFERENCE);
  const ant = anteriorRef !== null ? anteriorRef.ant : null;

  const tip = (
    apexSymbol: string, edgeSymbol: string, deg: number,
  ): Vec => {
    if (deg === 0 || ant === null) {
      return ZERO;
    }
    const apex = points[apexSymbol];
    const edge = points[edgeSymbol];
    if (apex === undefined || edge === undefined) {
      return ZERO;
    }
    const axis: Vec = { x: edge.x - apex.x, y: edge.y - apex.y };
    const rotated = rotateAnteriorly(axis, deg, ant);
    // The apex is held, so the edge's extra movement is the change in the axis
    // vector. Any translation the jaw applied is already on both points.
    const delta: Vec = { x: rotated.x - axis.x, y: rotated.y - axis.y };
    shift(edgeSymbol, delta);
    return delta;
  };

  const dU1Tip = tip('U1 Apex', 'U1 Incisal Edge', plan.u1Deg);
  const dL1Tip = tip('L1 Apex', 'L1 Incisal Edge', plan.l1Deg);

  // --- incisor bodily movement ----------------------------------------------
  // Apex and edge translate together along the same anterior axis the tipping
  // uses — bodily movement, no inclination change. The posterior dentition is
  // deliberately held: moving it would require an anchorage-loss ratio this
  // module would be inventing (the same discipline as "no autorotation").
  const bodily = (
    apexSymbol: string, edgeSymbol: string, mm: number,
  ): Vec => {
    if (mm === 0 || !hasScale || ant === null) {
      return ZERO;
    }
    if (points[apexSymbol] === undefined || points[edgeSymbol] === undefined) {
      return ZERO;
    }
    const v = scale(ant, toPx(mm));
    shift(apexSymbol, v);
    shift(edgeSymbol, v);
    return v;
  };

  const dU1Bodily = bodily('U1 Apex', 'U1 Incisal Edge', plan.u1Mm);
  const dL1Bodily = bodily('L1 Apex', 'L1 Incisal Edge', plan.l1Mm);

  // The incisor's *own* movement, tipping plus bodily — the quantity the
  // published retraction ratios are stated against (@see SOFT_TISSUE_RESPONSE:
  // the jaw translation the incisor rides with is counted by the jaw columns,
  // never here).
  const dU1 = add(dU1Tip, dU1Bodily);
  const dL1 = add(dL1Tip, dL1Bodily);

  // --- soft-tissue response -------------------------------------------------
  // The ratio-weighted movement of every soft-tissue point in the table, whether
  // or not that point happens to be plotted: the unplotted ones still govern the
  // silhouette the outline module synthesises in their place.
  const softVectors: { [symbol: string]: Vec } = {};
  if (plan.isSoftTissueFollowing) {
    SOFT_TISSUE_RESPONSE.forEach((ratio) => {
      softVectors[ratio.symbol] = add(
        add(scale(vMaxilla, ratio.maxilla), scale(vMandible, ratio.mandible)),
        add(scale(dU1, ratio.u1), scale(dL1, ratio.l1)),
      );
    });
  }

  const softTissueSymbols: string[] = [];
  SOFT_TISSUE_RESPONSE.forEach((ratio) => {
    const v = softVectors[ratio.symbol];
    if (
      v === undefined || points[ratio.symbol] === undefined ||
      length(v) < VISIBLE_PX
    ) {
      return;
    }
    shift(ratio.symbol, v);
    softTissueSymbols.push(ratio.symbol);
  });

  // --- the simulated map ----------------------------------------------------
  const landmarks: LandmarkMap = {};
  const movedSymbols: string[] = [];
  Object.keys(map).forEach((symbol) => {
    const value = map[symbol];
    const d = displacements[symbol];
    if (d === undefined || !isGeoPoint(value)) {
      landmarks[symbol] = value;
      return;
    }
    landmarks[symbol] = { x: value.x + d.x, y: value.y + d.y };
    if (length(d) >= VISIBLE_PX) {
      movedSymbols.push(symbol);
    }
  });

  // --- the map the profile silhouette is drawn from -------------------------
  const profileDisplacement: { [symbol: string]: Vec } = {};
  SOFT_TISSUE_RESPONSE.forEach((ratio) => {
    const v = softVectors[ratio.symbol];
    if (v !== undefined) {
      profileDisplacement[ratio.symbol] = v;
    }
  });
  PROFILE_ANCHORS.forEach(({ anchor, standsFor }) => {
    const v = softVectors[standsFor];
    profileDisplacement[anchor] = v !== undefined ? v : ZERO;
  });

  const profileLandmarks: LandmarkMap = {};
  Object.keys(map).forEach((symbol) => {
    const value = map[symbol];
    const d = profileDisplacement[symbol];
    if (d === undefined || !isGeoPoint(value)) {
      profileLandmarks[symbol] = value;
      return;
    }
    profileLandmarks[symbol] = { x: value.x + d.x, y: value.y + d.y };
  });

  return {
    landmarks,
    profileLandmarks,
    displacements,
    movedSymbols,
    mandibleReference,
    maxillaReference,
    hasScale,
    softTissueSymbols,
    softVectors,
  };
};

/**
 * The simulated anatomy, as curves — one implementation, shared by the SVG on
 * screen and the canvas that rasterises the PNG export.
 *
 * Everything skeletal and dental comes from the moved landmarks. The
 * soft-tissue profile does not: when the tracing lacks the full soft-tissue
 * landmark set the outline module *synthesises* the silhouette from the
 * skeletal profile, and drawing that from the moved skeleton would make the
 * simulated face follow the bone 1 : 1 — contradicting the response ratios the
 * panel publishes, and moving the profile even with the response switched off.
 * So the profile is built from `profileLandmarks`, whose anchors carry the
 * soft-tissue displacement of the point each stands in for.
 *
 * `frameFrom` is the plotted anatomy for both builds: it is the unit system the
 * outline module's inferred offsets are expressed in, and letting a plan
 * rescale it would drift structures the plan does not move (see
 * `OutlineOptions.frameFrom`). Held, a rigid landmark movement produces a
 * rigidly moved curve, which is what was asked for.
 */
export const simulatedOutlines = (
  simulation: Simulation, frameFrom: PointMap,
): Outline[] => {
  const options = { frameFrom };
  const skeletal = buildOutlines(placedPoints(simulation.landmarks), options)
    .filter((outline) => outline.id !== 'soft-tissue');
  const profile =
    buildOutlines(placedPoints(simulation.profileLandmarks), options)
      .filter((outline) => outline.id === 'soft-tissue');
  return [...profile, ...skeletal];
};

// ---- The value comparison ---------------------------------------------------

/**
 * The measurements a treatment plan is judged on, in the order a clinician
 * reads them. Symbols are the app's own measurement symbols (see
 * `analyses/landmarks/…`), so a row appears only when that measurement is
 * genuinely computable from the tracing.
 *
 * Overjet and overbite lead the list: they are the two numbers an orthognathic
 * or orthodontic plan is actually written against. Both are signed values
 * measured against the functional occlusal plane and reported by the dental
 * analysis, so they arrive here down the same `evaluate()` path as every other
 * row — this view computes nothing privately.
 *
 * The interincisal angle and the lower anterior face height used to be absent:
 * both are *defined* by an analysis module but interpreted by neither, and a
 * measurement without an interpretation used to reach no table at all. They
 * now reach the Summary and the report as measured values against their norms
 * (see `defaultInterpretAnalysis`), down the same `evaluate()` path as every
 * other row here, so they are listed.
 */
export const KEY_MEASUREMENTS: string[] = [
  'Overjet', 'Overbite',
  'ANB', 'Wits', 'SNA', 'SNB',
  'FMPA', 'NAPog',
  'U1-SN', 'IMPA', 'U1-L1',
  'ANS-Me (mm)',
  'Ls-E-line', 'Li-E-line', 'Nasolabial',
];

export interface Norm {
  mean: number; min: number; max: number;
  /** Whether min/max are a mean ± 1 SD band or a published range. */
  band?: NormBand;
}

/**
 * Norm bands, taken from the analysis modules' own `AnalysisComponent` entries
 * — the very numbers the Summary dialog and the report print. A symbol several
 * analyses define keeps the first band, matching the change table's own
 * "first analysis that reports it" rule.
 */
const buildNorms = (): {
  norms: { [symbol: string]: Norm };
  kinds: { [symbol: string]: MeasurementKind };
} => {
  const norms: { [symbol: string]: Norm } = {};
  const kinds: { [symbol: string]: MeasurementKind } = {};
  LATERAL_ANALYSES.forEach(({ analysis }) => {
    analysis.components.forEach(({ landmark, mean, min, max, band }) => {
      if (kinds[landmark.symbol] === undefined) {
        kinds[landmark.symbol] = measurementKind(landmark);
      }
      // A measurement the analyses state no norm for (see `NO_NORM`) gets no
      // entry at all, so the change table prints an em dash for it instead of
      // comparing it against NaN — which reads as "outside the norm band" and
      // would have flagged every plan that touched it.
      if (norms[landmark.symbol] === undefined && hasNorm(mean, min, max)) {
        norms[landmark.symbol] = { mean, min, max, band };
      }
    });
  });
  return { norms, kinds };
};

const { norms: NORMS, kinds: KINDS } = buildNorms();

export interface SimulationRow {
  /** The measurement, with `t1` = current and `t2` = simulated. */
  row: ChangeRow;
  norm: Norm | null;
  /** Whether the value sits inside the norm band, before and after. */
  isCurrentInNorm: boolean | null;
  isSimulatedInNorm: boolean | null;
  /**
   * True when the plan takes a value that was inside its norm band outside it.
   * Deviation alone cannot say this — a value already out of norm before the
   * plan is not something the plan did.
   */
  isCorrected: boolean;
  isWorsened: boolean;
  /**
   * True when the *plan changed this value* and left it outside the range a
   * real human head can produce (see `PLAUSIBILITY`). On a synthetic fixture
   * that is merely arithmetic; on a real film it means the plan (or the
   * tracing it moved) is wrong, and it must not be styled like an ordinary
   * out-of-norm value. A row the plan did not touch never carries it — a
   * measured value already outside plausibility is the tracing's own story.
   */
  isSimulatedImplausible: boolean;
}

/**
 * The band outside which a value stops being "out of norm" and starts being
 * *impossible*.
 *
 * Standard deviations alone will not do this job. A norm's SD describes the
 * spread of a healthy population, not the reach of pathology: overjet's norm is
 * 2.5 ± 1.0 mm, so a genuine Class III reverse overjet of −4 mm is already 6.5
 * SD out, and flagging it would be worse than saying nothing. So each kind of
 * measurement also carries a floor, in its own unit, below which nothing is
 * ever flagged — wide enough to contain the most severe real deformity, narrow
 * enough to catch the arithmetic a full-travel plan can produce (SNA 120.8°,
 * angle of convexity +27°).
 */
export const PLAUSIBILITY = {
  sd: 5,
  /** Degrees from the norm mean, for angular measurements. */
  angular: 22,
  /** Millimetres from the norm mean, for linear measurements. */
  linear: 12,
  /** Percentage points from the norm mean, for ratios. */
  ratio: 25,
};

export interface SimulationTable {
  /** The key measurements, in `KEY_MEASUREMENTS` order. */
  rows: SimulationRow[];
  /** Other measurements this plan also changes, counted but not listed. */
  otherChangedCount: number;
  /** True when millimetre measurements were withheld for want of a scale. */
  isLinearPendingScale: boolean;
  /**
   * Key measurements missing because the landmarks they are built from have not
   * been plotted. Plotting them fixes it.
   */
  unavailableSymbols: string[];
  /**
   * Key measurements missing only because they are millimetre values on a film
   * with no mm/px calibration. Their geometry is there; calibrating the film
   * fixes it. Kept apart from `unavailableSymbols` so the view does not send a
   * clinician hunting for landmarks that are already plotted.
   */
  pendingScaleSymbols: string[];
}

const inNorm = (value: number, norm: Norm | null): boolean | null =>
  norm === null ? null : (value >= norm.min && value <= norm.max);

/**
 * True when a value sits outside the plausibility band of its norm — the wider
 * of `PLAUSIBILITY.sd` half-bands and the floor for its kind. The half-band
 * ((max − min) / 2) is what the app already prints as the norm's ±, so the
 * band is stated in the very units the table shows.
 */
const isImplausible = (
  value: number, norm: Norm | null, kind: MeasurementKind,
): boolean => {
  if (norm === null) {
    return false;
  }
  const sd = normSd(norm.mean, norm.min, norm.max, norm.band);
  const floor = kind === 'linear'
    ? PLAUSIBILITY.linear
    : (kind === 'ratio' ? PLAUSIBILITY.ratio : PLAUSIBILITY.angular);
  const reach = Math.max(isFinite(sd) && sd > 0 ? PLAUSIBILITY.sd * sd : 0, floor);
  return Math.abs(value - norm.mean) > reach;
};

/**
 * Current vs simulated, for every key measurement the tracing can compute.
 *
 * The whole comparison is delegated to `buildChangeTable`, which evaluates each
 * lateral analysis through `analyses/evaluate` against both landmark maps. That
 * is the same calculation path as the Summary dialog and the printed report —
 * including the rule that a millimetre value is withheld on an uncalibrated
 * film — so this view can never disagree with them.
 */
export const buildSimulationTable = (
  current: LandmarkMap,
  simulated: LandmarkMap,
  scaleFactor: number | null,
): SimulationTable => {
  const table = buildChangeTable(current, simulated, scaleFactor, scaleFactor);
  const bySymbol: { [symbol: string]: ChangeRow } = {};
  table.groups.forEach((group) => {
    group.rows.forEach((row) => { bySymbol[row.symbol] = row; });
  });

  const hasScale = scaleFactor !== null && scaleFactor > 0;
  const rows: SimulationRow[] = [];
  const unavailableSymbols: string[] = [];
  const pendingScaleSymbols: string[] = [];
  KEY_MEASUREMENTS.forEach((symbol) => {
    const row = bySymbol[symbol];
    if (row === undefined) {
      // A millimetre measurement on an uncalibrated film is not "not
      // computable" — it is computable and deliberately withheld. Saying so
      // separately keeps the remedy right: calibrate, do not plot.
      if (!hasScale && KINDS[symbol] === 'linear') {
        pendingScaleSymbols.push(symbol);
      } else {
        unavailableSymbols.push(symbol);
      }
      return;
    }
    const norm = NORMS[symbol] !== undefined ? NORMS[symbol] : null;
    const isCurrentInNorm = inNorm(row.t1, norm);
    const isSimulatedInNorm = inNorm(row.t2, norm);
    const hasChange = Math.abs(row.change) >= 0.05;
    rows.push({
      row,
      norm,
      isCurrentInNorm,
      isSimulatedInNorm,
      isCorrected:
        hasChange && isCurrentInNorm === false && isSimulatedInNorm === true,
      isWorsened:
        hasChange && isCurrentInNorm === true && isSimulatedInNorm === false,
      isSimulatedImplausible:
        // A warning about what the *plan* did to the value, so a row the plan
        // did not touch never carries it: at rest the simulated column is the
        // measured value, and a measured value far outside its norm is the
        // tracing's own story (told by the norm colouring), not the
        // simulation's. Without this gate the app's own auto-plotted sample
        // film opened with a red implausibility mark on an untouched row.
        hasChange && isImplausible(row.t2, norm, row.kind),
    });
  });

  const isKey: { [symbol: string]: true } = {};
  KEY_MEASUREMENTS.forEach((s) => { isKey[s] = true; });
  let otherChangedCount = 0;
  Object.keys(bySymbol).forEach((symbol) => {
    if (isKey[symbol] === true) {
      return;
    }
    if (Math.abs(bySymbol[symbol].change) >= 0.05) {
      otherChangedCount += 1;
    }
  });

  return {
    rows,
    otherChangedCount,
    isLinearPendingScale: table.isLinearPendingScale || pendingScaleSymbols.length > 0,
    unavailableSymbols,
    pendingScaleSymbols,
  };
};

/**
 * `"10 mm"` / `"15°"` — one amount in one unit, spaced the way the app spaces
 * it everywhere else: a space before `mm`, none before the degree sign.
 */
export const formatAmount = (
  value: number, unit: 'mm' | '°', decimals: number = 0,
): string => (
  unit === 'mm'
    ? `${value.toFixed(decimals)} mm`
    : `${value.toFixed(decimals)}°`
);

/** `"5.0 mm advancement"` / `"3° retraction"` / `null` when the control is at 0. */
export const describeMovement = (
  spec: ControlSpec, value: number,
): string | null => {
  if (value === 0) {
    return null;
  }
  const magnitude = formatAmount(
    Math.abs(value), spec.unit, spec.unit === 'mm' ? 1 : 0,
  );
  return `${magnitude} ${value > 0 ? spec.positive : spec.negative}`;
};

/**
 * The plan as one line of prose, for the figure legend.
 *
 * The structure is named by its noun, not by the slider's label: the movement
 * word is already in `describeMovement`, and joining the two labels would
 * produce "Maxilla — impaction: 6.0 mm impaction".
 *
 * `controls`, when given, is this same plan's `describeControls(...)` — a
 * control that is not currently available (e.g. its calibration or reference
 * plane went away after the value was set) is left out even if the plan
 * still carries a stored non-zero value for it. `applySimulation` already
 * silently no-ops a movement whose landmarks or scale are missing, so this
 * sentence must not claim one it would not actually draw. Omitting the
 * parameter keeps the old, unfiltered behaviour.
 */
export const describePlan = (
  plan: SimulationPlan, controls?: ControlAvailability[],
): string[] => {
  const unavailable = controls !== undefined
    ? new Set(controls.filter((c) => !c.isAvailable).map((c) => c.spec.id))
    : null;
  const parts: string[] = [];
  SIMULATION_CONTROLS.forEach((spec) => {
    if (unavailable !== null && unavailable.has(spec.id)) {
      return;
    }
    const value = valueForControl(plan, spec.id);
    const described = describeMovement(spec, value);
    if (described !== null) {
      parts.push(`${spec.noun}: ${described}`);
    }
  });
  return parts;
};

// Every ControlId gets an explicit case in both switches below: the closing
// default is a type-safety fallthrough only. A new id that is *not* given a
// case would silently read/write l1Deg — the least visible bug this module
// can host — so extend both switches whenever ControlId grows.
export const valueForControl = (
  plan: SimulationPlan, id: ControlId,
): number => {
  switch (id) {
    case 'mandible': return plan.mandibleMm;
    case 'maxilla': return plan.maxillaMm;
    case 'impaction': return plan.impactionMm;
    case 'u1': return plan.u1Deg;
    case 'u1Mm': return plan.u1Mm;
    case 'l1Mm': return plan.l1Mm;
    default: return plan.l1Deg;
  }
};

export const withControlValue = (
  plan: SimulationPlan, id: ControlId, value: number,
): SimulationPlan => {
  switch (id) {
    case 'mandible': return { ...plan, mandibleMm: value };
    case 'maxilla': return { ...plan, maxillaMm: value };
    case 'impaction': return { ...plan, impactionMm: value };
    case 'u1': return { ...plan, u1Deg: value };
    case 'u1Mm': return { ...plan, u1Mm: value };
    case 'l1Mm': return { ...plan, l1Mm: value };
    default: return { ...plan, l1Deg: value };
  }
};
