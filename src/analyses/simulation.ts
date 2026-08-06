import { isGeoPoint } from 'utils/math';

import {
  LandmarkMap,
  placedPoints,
  buildChangeTable,
  ChangeRow,
} from 'analyses/superimposition';
import { LATERAL_ANALYSES } from 'analyses/lateral';

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
export type ReferenceId = 'occlusal' | 'palatal' | 'facial';

export interface Reference {
  id: ReferenceId;
  /** How the UI names the plane. */
  name: string;
  /** Landmarks the plane is built from, for the legend. */
  from: string;
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
    };
  }
  if (down === null) {
    return null;
  }
  // Perpendicular to the facial line N–Me, pointing anteriorly — the same
  // facial frame the outline module places synthesised points in.
  const ant: Vec = { x: down.y, y: -down.x };
  return {
    id, ant, up: superiorPerpendicular(ant, down),
    name: 'facial line',
    from: 'perpendicular to N–Me',
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
 * which is the Le Fort I convention. Both fall back to the facial line, and the
 * UI always names the plane actually used.
 */
const MANDIBLE_REFERENCE: ReferenceId[] = ['occlusal', 'palatal', 'facial'];
const MAXILLA_REFERENCE: ReferenceId[] = ['palatal', 'facial'];

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
 * `u1` / `l1` are applied to the *rotational* part of the incisal-edge movement
 * only, because the translational part is already accounted for by the jaw the
 * incisor travels with — otherwise the lips would be moved twice.
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

/** The ratios actually in play for a given plan, for the UI's disclosure list. */
export const activeSoftTissueRatios = (
  plan: SimulationPlan,
): Array<{ ratio: SoftTissueRatio; driver: string; value: number }> => {
  const rows: Array<{ ratio: SoftTissueRatio; driver: string; value: number }> = [];
  SOFT_TISSUE_RESPONSE.forEach((ratio) => {
    if (plan.maxillaMm !== 0 || plan.impactionMm !== 0) {
      if (ratio.maxilla > 0) {
        rows.push({ ratio, driver: 'maxilla', value: ratio.maxilla });
        return;
      }
    }
    if (plan.mandibleMm !== 0 && ratio.mandible > 0) {
      rows.push({ ratio, driver: 'mandible', value: ratio.mandible });
      return;
    }
    if (plan.u1Deg !== 0 && ratio.u1 > 0) {
      rows.push({ ratio, driver: 'upper incisor', value: ratio.u1 });
      return;
    }
    if (plan.l1Deg !== 0 && ratio.l1 > 0) {
      rows.push({ ratio, driver: 'lower incisor', value: ratio.l1 });
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
  /** Whether the soft-tissue profile follows, at the published ratios. */
  isSoftTissueFollowing: boolean;
}

export const EMPTY_PLAN: SimulationPlan = {
  mandibleMm: 0,
  maxillaMm: 0,
  impactionMm: 0,
  u1Deg: 0,
  l1Deg: 0,
  isSoftTissueFollowing: true,
};

export const isPlanEmpty = (plan: SimulationPlan): boolean => (
  plan.mandibleMm === 0 && plan.maxillaMm === 0 && plan.impactionMm === 0 &&
  plan.u1Deg === 0 && plan.l1Deg === 0
);

/** Stable key for memoizing a simulation across re-renders. */
export const planKey = (plan: SimulationPlan): string => [
  plan.mandibleMm, plan.maxillaMm, plan.impactionMm,
  plan.u1Deg, plan.l1Deg, plan.isSoftTissueFollowing ? 1 : 0,
].join('|');

// ---- Controls ---------------------------------------------------------------

export type ControlId = 'mandible' | 'maxilla' | 'impaction' | 'u1' | 'l1';

export interface ControlSpec {
  id: ControlId;
  /** Slider label. */
  label: string;
  /** What the two directions are called, negative first. */
  negative: string;
  positive: string;
  unit: 'mm' | '°';
  min: number;
  max: number;
  step: number;
  /** Landmarks the movement needs. */
  required: string[];
  /** True for movements expressed in millimetres, which need a calibration. */
  isLinear: boolean;
  /** One sentence on what is actually moved, shown as the control's help text. */
  description: string;
}

export const SIMULATION_CONTROLS: ControlSpec[] = [
  {
    id: 'mandible',
    label: 'Mandible',
    negative: 'setback', positive: 'advancement',
    unit: 'mm', min: -10, max: 10, step: 0.5,
    required: MANDIBLE_REQUIRED,
    isLinear: true,
    description:
      'Translates B, Pogonion, Gnathion, Menton, Gonion and the lower ' +
      'dentition as one rigid body. Articulare is held, so the condyle stays ' +
      'in its fossa.',
  },
  {
    id: 'maxilla',
    label: 'Maxilla — advancement',
    negative: 'setback', positive: 'advancement',
    unit: 'mm', min: -8, max: 8, step: 0.5,
    required: MAXILLA_REQUIRED,
    isLinear: true,
    description:
      'Translates ANS, PNS, A point and the upper dentition as one rigid ' +
      'body — the Le Fort I segment.',
  },
  {
    id: 'impaction',
    label: 'Maxilla — impaction',
    negative: 'downgraft', positive: 'impaction',
    unit: 'mm', min: -6, max: 6, step: 0.5,
    required: MAXILLA_REQUIRED,
    isLinear: true,
    description:
      'Moves the same segment perpendicular to its reference plane: positive ' +
      'is superior (impaction), negative inferior (downgraft). The mandible ' +
      'does not autorotate — that is a separate movement this app does not model.',
  },
  {
    id: 'u1',
    label: 'Upper incisor',
    negative: 'retraction', positive: 'proclination',
    unit: '°', min: -15, max: 15, step: 1,
    required: UPPER_INCISOR_REQUIRED,
    isLinear: false,
    description:
      'Tips the incisal edge about the U1 root apex, which is held. This is ' +
      'crown tipping, not bodily retraction, and no space closure is implied.',
  },
  {
    id: 'l1',
    label: 'Lower incisor',
    negative: 'retroclination', positive: 'proclination',
    unit: '°', min: -15, max: 15, step: 1,
    required: LOWER_INCISOR_REQUIRED,
    isLinear: false,
    description:
      'Tips the incisal edge about the L1 root apex, which is held. Crown ' +
      'tipping only.',
  },
];

export interface ControlAvailability {
  spec: ControlSpec;
  isAvailable: boolean;
  /** Landmarks this control is waiting on. */
  missingSymbols: string[];
  /** True when the only obstacle is the absent mm/px calibration. */
  needsScale: boolean;
  /** The sentence a disabled control shows instead of graying out silently. */
  reason: string | null;
}

export const describeControls = (
  map: LandmarkMap, scaleFactor: number | null,
): ControlAvailability[] => {
  const points = placedPoints(map);
  const hasScale = scaleFactor !== null && scaleFactor > 0;
  return SIMULATION_CONTROLS.map((spec) => {
    const missingSymbols = missing(points, spec.required);
    const needsScale = spec.isLinear && !hasScale;
    const isAvailable = missingSymbols.length === 0 && !needsScale;
    let reason: string | null = null;
    if (missingSymbols.length > 0) {
      reason =
        `${spec.label} needs ${missingSymbols.join(', ')} — ` +
        'plot them from the analysis’ step list first.';
    } else if (needsScale) {
      reason =
        'A millimetre movement needs an mm/px calibration for this film. ' +
        'Set it from the calibration chip in the toolbar; angular movements ' +
        'are scale-independent and stay available.';
    }
    return { spec, isAvailable, missingSymbols, needsScale, reason };
  });
};

/** Whether the "Simulate" action is available, and why not when it is not. */
export interface SimulationReadiness {
  canSimulate: boolean;
  reason: string;
}

export const getSimulationReadiness = (
  map: LandmarkMap, scaleFactor: number | null,
): SimulationReadiness => {
  const points = placedPoints(map);
  const controls = describeControls(map, scaleFactor);
  const available = controls.filter((c) => c.isAvailable);
  // Something has to anchor the anterior direction, or no movement has a
  // meaning; and at least one movement has to be possible.
  const reference = getReference(points, ['occlusal', 'palatal', 'facial']);
  if (reference !== null && available.length > 0) {
    return {
      canSimulate: true,
      reason:
        'Simulate a treatment plan on this tracing — geometric only, ' +
        'nothing is saved',
    };
  }
  if (reference === null) {
    return {
      canSimulate: false,
      reason:
        'A simulation needs an anatomical reference plane. Plot N and Menton ' +
        '(or the palatal plane, PNS and ANS) and it becomes available.',
    };
  }
  const blockedByScale = controls.every((c) => c.needsScale || c.missingSymbols.length > 0);
  if (blockedByScale && controls.some((c) => c.needsScale && c.missingSymbols.length === 0)) {
    return {
      canSimulate: false,
      reason:
        'The skeletal movements are entered in millimetres, so this film ' +
        'needs an mm/px calibration, and no incisor landmarks are plotted ' +
        'yet. Calibrate from the toolbar chip, or plot the incisors.',
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

export interface Simulation {
  /** The simulated landmark map — a copy; the input is never touched. */
  landmarks: LandmarkMap;
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
  const anteriorRef = getReference(points, ['palatal', 'facial', 'occlusal']);
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

  const dU1 = tip('U1 Apex', 'U1 Incisal Edge', plan.u1Deg);
  const dL1 = tip('L1 Apex', 'L1 Incisal Edge', plan.l1Deg);

  // --- soft-tissue response -------------------------------------------------
  const softTissueSymbols: string[] = [];
  if (plan.isSoftTissueFollowing) {
    SOFT_TISSUE_RESPONSE.forEach((ratio) => {
      if (points[ratio.symbol] === undefined) {
        return;
      }
      const v = add(
        add(scale(vMaxilla, ratio.maxilla), scale(vMandible, ratio.mandible)),
        add(scale(dU1, ratio.u1), scale(dL1, ratio.l1)),
      );
      if (length(v) < VISIBLE_PX) {
        return;
      }
      shift(ratio.symbol, v);
      softTissueSymbols.push(ratio.symbol);
    });
  }

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

  return {
    landmarks,
    displacements,
    movedSymbols,
    mandibleReference,
    maxillaReference,
    hasScale,
    softTissueSymbols,
  };
};

// ---- The value comparison ---------------------------------------------------

/**
 * The measurements a treatment plan is judged on, in the order a clinician
 * reads them. Symbols are the app's own measurement symbols (see
 * `analyses/landmarks/…`), so a row appears only when that measurement is
 * genuinely computable from the tracing.
 *
 * The interincisal angle and the lower anterior face height (ANS–Me) are
 * deliberately absent: both are *defined* by an analysis module but neither is
 * interpreted by it, so the app reports them nowhere — not in the Summary, not
 * in the printed report, not in a superimposition. Listing them here would mean
 * computing them through a second, private code path, and this view does not do
 * that. See `NOT_INTERPRETED` for the note the UI shows instead.
 */
export const KEY_MEASUREMENTS: string[] = [
  'ANB', 'Wits', 'SNA', 'SNB',
  'FMPA', 'NAPog',
  'U1-SN', 'IMPA',
  'Ls-E-line', 'Li-E-line',
];

/**
 * Measurements a clinician would expect in a VTO that this app defines but
 * never reports, because no analysis module interprets them. Named on screen so
 * their absence is a disclosed limitation rather than an oversight.
 */
export const NOT_INTERPRETED: string[] = [
  'the interincisal angle (U1-L1)',
  'lower anterior face height (ANS-Me)',
];

export interface Norm { mean: number; min: number; max: number; }

/**
 * Norm bands, taken from the analysis modules' own `AnalysisComponent` entries
 * — the very numbers the Summary dialog and the report print. A symbol several
 * analyses define keeps the first band, matching the change table's own
 * "first analysis that reports it" rule.
 */
const buildNorms = (): { [symbol: string]: Norm } => {
  const norms: { [symbol: string]: Norm } = {};
  LATERAL_ANALYSES.forEach(({ analysis }) => {
    analysis.components.forEach(({ landmark, mean, min, max }) => {
      if (norms[landmark.symbol] === undefined) {
        norms[landmark.symbol] = { mean, min, max };
      }
    });
  });
  return norms;
};

const NORMS = buildNorms();

export interface SimulationRow {
  /** The measurement, with `t1` = current and `t2` = simulated. */
  row: ChangeRow;
  norm: Norm | null;
  /** Whether the value sits inside the norm band, before and after. */
  isCurrentInNorm: boolean | null;
  isSimulatedInNorm: boolean | null;
}

export interface SimulationTable {
  /** The key measurements, in `KEY_MEASUREMENTS` order. */
  rows: SimulationRow[];
  /** Other measurements this plan also changes, counted but not listed. */
  otherChangedCount: number;
  /** True when millimetre measurements were withheld for want of a scale. */
  isLinearPendingScale: boolean;
  /** Key measurements the tracing cannot compute yet. */
  unavailableSymbols: string[];
}

const inNorm = (value: number, norm: Norm | null): boolean | null =>
  norm === null ? null : (value >= norm.min && value <= norm.max);

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

  const rows: SimulationRow[] = [];
  const unavailableSymbols: string[] = [];
  KEY_MEASUREMENTS.forEach((symbol) => {
    const row = bySymbol[symbol];
    if (row === undefined) {
      unavailableSymbols.push(symbol);
      return;
    }
    const norm = NORMS[symbol] !== undefined ? NORMS[symbol] : null;
    rows.push({
      row,
      norm,
      isCurrentInNorm: inNorm(row.t1, norm),
      isSimulatedInNorm: inNorm(row.t2, norm),
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
    isLinearPendingScale: table.isLinearPendingScale,
    unavailableSymbols,
  };
};

/** `"5.0 mm advancement"` / `"3° retraction"` / `null` when the control is at 0. */
export const describeMovement = (
  spec: ControlSpec, value: number,
): string | null => {
  if (value === 0) {
    return null;
  }
  const magnitude = spec.unit === 'mm'
    ? `${Math.abs(value).toFixed(1)} mm`
    : `${Math.abs(value).toFixed(0)}°`;
  return `${magnitude} ${value > 0 ? spec.positive : spec.negative}`;
};

/** The plan as one line of prose, for the figure legend. */
export const describePlan = (plan: SimulationPlan): string[] => {
  const parts: string[] = [];
  SIMULATION_CONTROLS.forEach((spec) => {
    const value = valueForControl(plan, spec.id);
    const described = describeMovement(spec, value);
    if (described !== null) {
      parts.push(`${spec.label}: ${described}`);
    }
  });
  return parts;
};

export const valueForControl = (
  plan: SimulationPlan, id: ControlId,
): number => {
  switch (id) {
    case 'mandible': return plan.mandibleMm;
    case 'maxilla': return plan.maxillaMm;
    case 'impaction': return plan.impactionMm;
    case 'u1': return plan.u1Deg;
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
    default: return { ...plan, l1Deg: value };
  }
};
