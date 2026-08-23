import { isGeoPoint } from 'utils/math';

import { evaluateAnalysis, getReportableSymbols } from 'analyses/evaluate';
import { LATERAL_ANALYSES } from 'analyses/lateral';
// Pure geometry module (no React, no DOM) — the same one the editor's SVG
// overlay and the raster exports draw from.
import { buildOutlines, Outline } from 'components/TracingViewer/outlines';

/**
 * Cephalometric superimposition: the geometry that brings two timepoints of the
 * same patient into one coordinate frame, and the measurement comparison that
 * quantifies what changed between them.
 *
 * This module is pure — no store, no DOM. It is the single source of truth for
 * both the on-screen superimposition (SVG) and its rasterised export (canvas),
 * exactly as `TracingViewer/outlines.ts` is for the tracing itself.
 *
 * Nothing here is a simulation or a prediction: every number comes from the two
 * tracings the clinician actually plotted.
 */

export type LandmarkMap = { [symbol: string]: GeoObject | undefined };

/**
 * A 2-D similarity transform as the affine matrix
 *
 *     | a  c  e |          x' = a·x + c·y + e
 *     | b  d  f |          y' = b·x + d·y + f
 *
 * written in the same component order as SVG's `matrix(a b c d e f)` and
 * canvas' `setTransform(a, b, c, d, e, f)`, so it can be handed to either
 * renderer untouched.
 */
export interface Transform {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

export const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const applyTransform = (t: Transform, p: GeoPoint): GeoPoint => ({
  x: t.a * p.x + t.c * p.y + t.e,
  y: t.b * p.x + t.d * p.y + t.f,
});

/** `matrix(a b c d e f)` for an SVG `transform` attribute. */
export const toSvgMatrix = (t: Transform): string =>
  `matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f})`;

/** Every placed *point* of a landmark map, as plain points. */
export const placedPoints = (map: LandmarkMap): { [symbol: string]: GeoPoint } => {
  const points: { [symbol: string]: GeoPoint } = {};
  Object.keys(map).forEach((symbol) => {
    const value = map[symbol];
    if (isGeoPoint(value)) {
      points[symbol] = { x: value.x, y: value.y };
    }
  });
  return points;
};

/**
 * Every placed point of a landmark map, moved into the other timepoint's frame.
 *
 * Outlines are then built from the *transformed* points rather than by
 * transforming the finished curves. That is equivalent — every construction in
 * `TracingViewer/outlines.ts` is derived from the landmarks through the facial
 * frame (unit vectors and facial height), so it is covariant under rotation,
 * translation and uniform scale — and it keeps both renderers free of nested
 * transforms, so stroke weights stay uniform across the two tracings.
 */
export const transformLandmarks = (
  map: LandmarkMap, transform: Transform,
): { [symbol: string]: GeoPoint } => {
  const points = placedPoints(map);
  const moved: { [symbol: string]: GeoPoint } = {};
  Object.keys(points).forEach((symbol) => {
    moved[symbol] = applyTransform(transform, points[symbol]);
  });
  return moved;
};

// ---- Registration bases -----------------------------------------------------

export type RegistrationBasisId = 'cranialBase' | 'maxillary' | 'mandibular';

export interface RegistrationBasis {
  id: RegistrationBasisId;
  /** Segmented-control label. */
  label: string;
  /** Full clinical name, for the legend and the printout. */
  name: string;
  /**
   * What the registration holds still and what the change then reads as, in one
   * line — the sentence the legend states inline, because a reader who does not
   * know what was held cannot read the table at all.
   */
  summary: string;
  /**
   * The same fact in full, with the caveats that qualify it. Kept behind the
   * legend's "About this view" disclosure on screen and printed in full on
   * paper: condensed, never dropped.
   */
  description: string;
  /**
   * The landmark held fixed: T2's copy of it is moved onto T1's copy, so this
   * point is by definition unchanged in the superimposition.
   */
  origin: string;
  /** The reference line whose *direction* is matched, `from` → `to`. */
  from: string;
  to: string;
}

/**
 * The registrations this app implements — and only those. Each is a rigid
 * (translation + rotation) fit of a line and a point that both tracings carry,
 * which is what a hand superimposition on an acetate overlay does.
 *
 * Registrations that need structures this app does not trace (the internal
 * cortical outline of the symphysis for a true Björk mandibular
 * superimposition, or the anterior wall of the pterygomaxillary fissure) are
 * deliberately absent rather than approximated under their clinical names.
 */
export const REGISTRATION_BASES: RegistrationBasis[] = [
  {
    id: 'cranialBase',
    label: 'Cranial base',
    name: 'Anterior cranial base — S–N at Sella',
    summary:
      'Sella held fixed, S–N direction matched: the change is growth plus ' +
      'treatment.',
    description:
      'Sella is held fixed and the S–N line direction is matched, so the ' +
      'displayed change is the total change of the face relative to the ' +
      'cranium — growth plus treatment.',
    origin: 'S',
    from: 'S',
    to: 'N',
  },
  {
    id: 'maxillary',
    label: 'Maxilla',
    name: 'Maxillary — palatal plane (PNS–ANS) at ANS',
    summary:
      'ANS held fixed, palatal plane direction matched: the change reads ' +
      'against the maxilla, chiefly of the upper dentition.',
    description:
      'ANS is held fixed and the palatal plane direction is matched, so the ' +
      'change reads as movement relative to the maxilla — chiefly of the ' +
      'upper dentition. Registering on landmarks (not on internal maxillary ' +
      'structures) means remodelling of ANS/PNS itself is absorbed into the fit.',
    origin: 'ANS',
    from: 'PNS',
    to: 'ANS',
  },
  {
    id: 'mandibular',
    label: 'Mandible',
    name: 'Mandibular — Go–Me plane at Menton',
    summary:
      'Menton held fixed, Go–Me direction matched: the change reads against ' +
      'the mandible. A landmark fit, not a Björk superimposition.',
    description:
      'Menton is held fixed and the mandibular plane (Go–Me) direction is ' +
      'matched, so the change reads as movement relative to the mandible. ' +
      'This is a landmark fit on the mandibular plane, not a Björk ' +
      'superimposition on the symphyseal cortical outline, which this app ' +
      'does not trace.',
    origin: 'Me',
    from: 'Go',
    to: 'Me',
  },
];

export const getBasis = (id: RegistrationBasisId): RegistrationBasis =>
  REGISTRATION_BASES.filter((b) => b.id === id)[0] || REGISTRATION_BASES[0];

/** The distinct landmark symbols a basis needs at both timepoints. */
export const basisSymbols = (basis: RegistrationBasis): string[] => {
  const symbols: string[] = [];
  [basis.origin, basis.from, basis.to].forEach((s) => {
    if (symbols.indexOf(s) === -1) {
      symbols.push(s);
    }
  });
  return symbols;
};

/** Which of a basis' landmarks are missing from a landmark map. */
export const missingBasisSymbols = (
  basis: RegistrationBasis, map: LandmarkMap,
): string[] => basisSymbols(basis).filter((s) => !isGeoPoint(map[s]));

/**
 * Bases that can be built from a single tracing. A record with none of these
 * cannot take part in a superimposition, however many other points it carries.
 */
export const availableBases = (map: LandmarkMap): RegistrationBasis[] =>
  REGISTRATION_BASES.filter((b) => missingBasisSymbols(b, map).length === 0);

// ---- The transform ----------------------------------------------------------

export interface Registration {
  basis: RegistrationBasis;
  /** Maps T2 image coordinates into T1 image coordinates. */
  transform: Transform;
  /** True when both tracings carry every landmark the basis needs. */
  isAvailable: boolean;
  /** Basis landmarks missing from T1 / T2, for an honest failure message. */
  missingT1: string[];
  missingT2: string[];
  /** Rotation applied to T2, in degrees (positive = clockwise on screen). */
  rotationDeg: number;
  /** Translation applied to T2, in T1 pixels. */
  translationPx: number;
  /**
   * Uniform scale applied to T2 so a millimetre of patient measures the same on
   * both films. 1 when no rescaling was applied.
   */
  magnification: number;
  /**
   * True when the two films were *assumed* to be at the same magnification
   * because at least one of them carries no mm/px calibration. The overlay is
   * then only as trustworthy as that assumption, and must say so.
   */
  isMagnificationAssumed: boolean;
}

const EMPTY_REGISTRATION = (
  basis: RegistrationBasis, missingT1: string[], missingT2: string[],
): Registration => ({
  basis,
  transform: IDENTITY,
  isAvailable: false,
  missingT1,
  missingT2,
  rotationDeg: 0,
  translationPx: 0,
  magnification: 1,
  isMagnificationAssumed: false,
});

/** Films whose mm/px differ by less than this are treated as equally magnified. */
const MAGNIFICATION_EPSILON = 0.002;

/**
 * Builds the rigid-body transform that superimposes T2 on T1.
 *
 * The maths, in order of application to a T2 point `p`:
 *
 *   1. `p − O2`    — move T2's registration landmark to the origin.
 *   2. `× k`       — rescale, where `k = sf2 / sf1` (mm-per-px of T2 over that
 *                    of T1). A distance of `d` mm occupies `d/sf` pixels, so
 *                    multiplying T2's pixels by `k` makes one pixel mean the
 *                    same patient distance on both films. With either film
 *                    uncalibrated, `k = 1` and the equal-magnification
 *                    assumption is reported rather than hidden.
 *   3. `× R(θ)`    — rotate by θ = atan2(T1's reference direction) −
 *                    atan2(T2's), so the two reference lines become parallel
 *                    and point the same way.
 *   4. `+ O1`      — put the registration landmark back on T1's copy of it.
 *
 * Composed: `p' = k·R·(p − O2) + O1`, i.e. the affine matrix
 * `a = k·cosθ, b = k·sinθ, c = −k·sinθ, d = k·cosθ` with the translation
 * `e, f` chosen so that `O2 ↦ O1` exactly.
 *
 * No shear and no non-uniform scaling: those would deform the anatomy and
 * fabricate change. Scale is only ever applied to reconcile film magnification,
 * never to make the two tracings agree.
 */
export const buildRegistration = (
  basis: RegistrationBasis,
  t1: LandmarkMap,
  t2: LandmarkMap,
  scaleFactorT1: number | null,
  scaleFactorT2: number | null,
): Registration => {
  const missingT1 = missingBasisSymbols(basis, t1);
  const missingT2 = missingBasisSymbols(basis, t2);
  if (missingT1.length > 0 || missingT2.length > 0) {
    return EMPTY_REGISTRATION(basis, missingT1, missingT2);
  }

  const O1 = t1[basis.origin] as GeoPoint;
  const O2 = t2[basis.origin] as GeoPoint;
  const A1 = t1[basis.from] as GeoPoint;
  const B1 = t1[basis.to] as GeoPoint;
  const A2 = t2[basis.from] as GeoPoint;
  const B2 = t2[basis.to] as GeoPoint;

  const angle1 = Math.atan2(B1.y - A1.y, B1.x - A1.x);
  const angle2 = Math.atan2(B2.y - A2.y, B2.x - A2.x);
  const theta = angle1 - angle2;

  const hasBothScales =
    scaleFactorT1 !== null && scaleFactorT1 > 0 &&
    scaleFactorT2 !== null && scaleFactorT2 > 0;
  const rawK = hasBothScales ? scaleFactorT2! / scaleFactorT1! : 1;
  // A calibration difference below the epsilon is measurement noise in the
  // clinician's two ruler clicks, not a real magnification difference.
  const k = Math.abs(rawK - 1) < MAGNIFICATION_EPSILON ? 1 : rawK;

  const cos = Math.cos(theta) * k;
  const sin = Math.sin(theta) * k;

  const transform: Transform = {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: O1.x - (cos * O2.x - sin * O2.y),
    f: O1.y - (sin * O2.x + cos * O2.y),
  };

  // How far T2 actually had to move, reported so the clinician can sanity-check
  // the fit (a huge translation usually means a mis-plotted registration point).
  // O1 and O2 live in their own image's raw pixel grid, which is only the same
  // grid as each other's when the two films share a magnification — scaled by
  // the same `k` the transform itself applies to T2 first, both points are
  // expressed in T1-pixel-equivalent units before they are differenced, so the
  // millimetre figure below (T1's own scaleFactor is the only one applied to
  // it, downstream) is never built by mixing two different pixels-per-mm
  // ratios together. Without both calibrations `k` is already 1 by definition
  // (`hasBothScales` above), and the figure is already flagged
  // `isMagnificationAssumed` at the call site, so no separate handling is
  // needed here for that case.
  const translationPx = Math.hypot(O1.x - O2.x * k, O1.y - O2.y * k);
  // Screen y grows downwards, so a positive θ turns clockwise on screen.
  let rotationDeg = (theta * 180) / Math.PI;
  while (rotationDeg > 180) { rotationDeg -= 360; }
  while (rotationDeg < -180) { rotationDeg += 360; }

  return {
    basis,
    transform,
    isAvailable: true,
    missingT1,
    missingT2,
    rotationDeg,
    translationPx,
    magnification: k,
    isMagnificationAssumed: !hasBothScales,
  };
};

// ---- Framing ----------------------------------------------------------------

export interface Box { x: number; y: number; width: number; height: number; }

/** Padding kept around the two tracings, as a fraction of their extent. */
const FRAME_PADDING = 0.12;

/**
 * The region of T1's coordinate space that holds both tracings, padded — the
 * viewBox of the superimposition. A lateral ceph is mostly empty field, so
 * framing on the anatomy (rather than on the whole film) is what makes the
 * comparison legible. Returns null when there is nothing to frame.
 *
 * The outline control points are measured, not just the landmarks: the
 * synthesised soft-tissue silhouette reaches well anterior to every plotted
 * point (the nose tip especially), and a frame drawn round the landmarks alone
 * clips the profile off the exported image.
 */
export const superimpositionFrame = (
  t1: LandmarkMap, t2: LandmarkMap, transform: Transform,
): Box | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  const add = (p: GeoPoint) => {
    count += 1;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  const addAll = (points: { [symbol: string]: GeoPoint }) => {
    Object.keys(points).forEach((s) => add(points[s]));
    buildOutlines(points).forEach((outline) => {
      outline.points.forEach(([x, y]) => add({ x, y }));
    });
  };
  addAll(placedPoints(t1));
  addAll(transformLandmarks(t2, transform));

  if (count < 3 || maxX <= minX || maxY <= minY) {
    return null;
  }
  const padX = (maxX - minX) * FRAME_PADDING;
  const padY = (maxY - minY) * FRAME_PADDING;
  return {
    x: minX - padX,
    y: minY - padY,
    width: (maxX - minX) + padX * 2,
    height: (maxY - minY) + padY * 2,
  };
};

// ---- Orphan geometry ---------------------------------------------------------

/**
 * Landmark symbols placed on this tracing with no counterpart on the other —
 * the ones a hand superimposition on an acetate overlay would never carry,
 * because nothing on the other film exists to compare them against. Both
 * renderers (the on-screen SVG and the exported PNG) draw these dimmed rather
 * than at full weight: the same idiom the change table already uses for a
 * difference too small to be a finding (`isWithinPlottingError`) — still
 * visible, no longer competing for attention with the geometry both tracings
 * actually share. Left at full weight, a tracing plotted for a different
 * analysis than its partner reads as noise scattered over the posterior skull
 * rather than as the two clean tracings it should be.
 */
export const orphanSymbols = (
  own: { [symbol: string]: GeoPoint }, other: { [symbol: string]: GeoPoint },
): string[] => Object.keys(own).filter((symbol) => other[symbol] === undefined);

/**
 * Outline ids drawn for this tracing with no counterpart on the other — the
 * same "nothing to compare against" rule applied to the small synthesised
 * shapes (the sella fossa, the orbital rim arc, the ear-rod ring, an incisor
 * lozenge) rather than to individual landmark dots. `buildOutlines` already
 * omits an outline whose defining landmarks are not all placed on *this*
 * tracing; this only asks whether the *other* tracing drew the same outline.
 */
export const orphanOutlineIds = (
  ownOutlines: Outline[], otherOutlines: Outline[],
): string[] => {
  const otherIds: { [id: string]: true } = {};
  otherOutlines.forEach((o) => { otherIds[o.id] = true; });
  return ownOutlines
    .filter((o) => otherIds[o.id] !== true)
    .map((o) => o.id);
};

// ---- Figure annotation ------------------------------------------------------

/** A round millimetre length and its extent in T1 pixels, for the scale bar. */
export interface ScaleBar { mm: number; px: number; }

/** Round lengths a clinician reads without arithmetic. */
const NICE_MM = [1, 2, 5, 10, 20, 50, 100];

/**
 * The scale bar for a framed superimposition: the longest round millimetre
 * length that stays inside a third of the frame's width and is still long
 * enough to measure against. Null when the film carries no mm/px calibration —
 * a bar without a calibration would be a fabricated ruler.
 */
export const chooseScaleBar = (
  frame: Box, scaleFactor: number | null,
): ScaleBar | null => {
  if (scaleFactor === null || !isFinite(scaleFactor) || scaleFactor <= 0) {
    return null;
  }
  const maxPx = frame.width / 3;
  const minPx = frame.width * 0.08;
  let best: ScaleBar | null = null;
  NICE_MM.forEach((mm) => {
    const px = mm / scaleFactor;
    if (px <= maxPx && px >= minPx) {
      best = { mm, px };
    }
  });
  return best;
};

/**
 * Everything drawn on the figure that is not anatomy: the registration point,
 * the reference line whose direction was matched — at *both* timepoints, so
 * that two coincident lines are visible proof the fit is right — the labels of
 * the registration landmarks, and the millimetre scale bar.
 *
 * Pure, so the SVG on screen, the printed sheet and the exported PNG annotate
 * the same figure in the same places.
 */
export interface SuperimpositionAnnotations {
  /** Landmark held fixed by the registration (e.g. "S"). */
  originSymbol: string;
  /** Its position in T1's frame, or null when it is not placed. */
  origin: GeoPoint | null;
  /** The matched reference line of T1 and of registered T2, `from` → `to`. */
  t1Basis: [GeoPoint, GeoPoint] | null;
  t2Basis: [GeoPoint, GeoPoint] | null;
  /** Registration landmarks of T1, labelled so the reader can name the dots. */
  labels: Array<{ symbol: string; point: GeoPoint }>;
  /** Scale bar derived from T1's calibration, or null when uncalibrated. */
  scaleBar: ScaleBar | null;
}

export const buildAnnotations = (
  basis: RegistrationBasis,
  t1Points: { [symbol: string]: GeoPoint },
  t2Points: { [symbol: string]: GeoPoint },
  frame: Box,
  scaleFactorT1: number | null,
): SuperimpositionAnnotations => {
  const lineOf = (
    points: { [symbol: string]: GeoPoint },
  ): [GeoPoint, GeoPoint] | null => {
    const from = points[basis.from];
    const to = points[basis.to];
    return from !== undefined && to !== undefined ? [from, to] : null;
  };
  const labels: Array<{ symbol: string; point: GeoPoint }> = [];
  basisSymbols(basis).forEach((symbol) => {
    const point = t1Points[symbol];
    if (point !== undefined) {
      labels.push({ symbol, point });
    }
  });
  return {
    originSymbol: basis.origin,
    origin: t1Points[basis.origin] !== undefined ? t1Points[basis.origin] : null,
    t1Basis: lineOf(t1Points),
    t2Basis: lineOf(t2Points),
    labels,
    scaleBar: chooseScaleBar(frame, scaleFactorT1),
  };
};

// ---- Measurement change -----------------------------------------------------

/** What a measurement is measured in — which decides what its change means. */
export type MeasurementKind = 'angular' | 'linear' | 'ratio';

/**
 * The kind of a measurement, by the same rules the Summary dialog uses to pick
 * its unit suffix (`AnalysisResultsViewer#getUnitSuffix`). Kept here because
 * this module is pure and must not import a React component.
 */
export const measurementKind = (
  landmark: CephLandmark | undefined,
): MeasurementKind => {
  if (landmark === undefined) {
    return 'ratio';
  }
  if (
    landmark.type === 'angle' || landmark.type === 'sum' ||
    landmark.unit === 'degree'
  ) {
    return 'angular';
  }
  if (landmark.unit === 'mm' || landmark.unit === 'cm' || landmark.unit === 'in') {
    return 'linear';
  }
  return 'ratio';
};

/**
 * The reproducibility floor of hand landmark plotting, from the classical
 * landmark-identification-error literature: about ±0.5 mm of scatter on a
 * point and about ±1° on an angle between two plotted points, per tracing.
 *
 * A change smaller than this is not a finding — it is the same measurement
 * taken twice. The view says so rather than letting a 0.3° "change" be read as
 * growth or as a treatment effect.
 */
export const PLOTTING_ERROR: { angular: number; linear: number } = {
  angular: 1,
  linear: 0.5,
};

/** Whether a change of this size is indistinguishable from tracing error. */
export const isWithinPlottingError = (
  kind: MeasurementKind, change: number,
): boolean => {
  if (kind === 'angular') {
    return Math.abs(change) < PLOTTING_ERROR.angular;
  }
  if (kind === 'linear') {
    return Math.abs(change) < PLOTTING_ERROR.linear;
  }
  // A dimensionless ratio has no published plotting-error figure here; claiming
  // one would be inventing a threshold.
  return false;
};

export interface ChangeRow {
  symbol: string;
  /** Measurement name, when the analysis gives one distinct from the symbol. */
  name: string | null;
  /** Landmark definition, for the unit suffix. */
  landmark: CephLandmark | undefined;
  t1: number;
  t2: number;
  /** T2 − T1. */
  change: number;
  /** Angular, linear or dimensionless — bars never mix two of these. */
  kind: MeasurementKind;
  /** True when |change| is below the hand-plotting reproducibility floor. */
  isWithinError: boolean;
}

export interface ChangeGroup {
  analysisId: string;
  analysisName: string;
  rows: ChangeRow[];
}

/**
 * The reference length the magnitude bars of one kind are drawn against, and
 * how many rows share it. A bar is only meaningful as a comparison *within* its
 * kind, and a kind with a single row has nothing to compare against — so the
 * count is part of the scale, not an afterthought.
 */
export interface BarScale { max: number; count: number; }

export interface ChangeTable {
  groups: ChangeGroup[];
  rowCount: number;
  /**
   * Measurements one timepoint could compute and the other could not — listed
   * nowhere in the table, counted here so the omission is on the record.
   */
  oneSidedCount: number;
  /**
   * Measurements *neither* film can compute, and the landmarks unplaced on both
   * that would unlock them. Without this the table silently drops most of the
   * app's measurements: an orthodontist would ask where IMPA and Wits went.
   */
  neitherCount: number;
  /** A few of those measurements, by symbol, so the omission is nameable. */
  neitherSymbols: string[];
  /** Landmarks missing from both tracings, the worklist that would fix it. */
  missingBothSymbols: string[];
  /** Rows whose change is below the hand-plotting reproducibility floor. */
  withinErrorCount: number;
  /**
   * True when linear (mm) measurements were withheld at either timepoint for
   * want of an image scale. Those rows are absent, and the reason has to be
   * stated rather than left to look like "no change".
   */
  isLinearPendingScale: boolean;
  /** Bar reference length and row count, per measurement kind. */
  scales: { [kind: string]: BarScale };
}

/**
 * Every measurement both timepoints can compute, with its value at each and the
 * signed change between them.
 *
 * Each of the app's lateral analyses is evaluated read-only at both timepoints
 * through `analyses/evaluate` — the same path the Summary dialog and the
 * clinical report take, including its mm scale-factor rule — so a measurement
 * appears here only when the geometry genuinely yields it on both films. A
 * measurement shared by several analyses is listed once, under the first
 * analysis that reports it.
 *
 * Norms are deliberately absent: what a superimposition reports is the change.
 */
export const buildChangeTable = (
  t1: LandmarkMap,
  t2: LandmarkMap,
  scaleFactorT1: number | null,
  scaleFactorT2: number | null,
): ChangeTable => {
  const groups: ChangeGroup[] = [];
  const seen: { [symbol: string]: true } = {};
  let rowCount = 0;
  let isLinearPendingScale = false;
  const scales: { [kind: string]: BarScale } = {
    angular: { max: 0, count: 0 },
    linear: { max: 0, count: 0 },
    ratio: { max: 0, count: 0 },
  };
  // Symbol sets rather than running counters: a measurement several analyses
  // define must be counted once, and a later analysis that *can* compute it
  // has to win over an earlier one that could not.
  const oneSided: { [symbol: string]: true } = {};
  const neither: { [symbol: string]: true } = {};
  const missingBoth: { [symbol: string]: true } = {};

  LATERAL_ANALYSES.forEach((entry) => {
    let e1;
    let e2;
    try {
      e1 = evaluateAnalysis(entry.analysis, t1, scaleFactorT1);
      e2 = evaluateAnalysis(entry.analysis, t2, scaleFactorT2);
    } catch (err) {
      // An analysis that cannot be evaluated contributes nothing rather than
      // taking the whole comparison down with it.
      return;
    }
    if (e1.pendingScaleCount > 0 || e2.pendingScaleCount > 0) {
      isLinearPendingScale = true;
    }

    const valuesOf = (evaluation: typeof e1): { [symbol: string]: number } => {
      const values: { [symbol: string]: number } = {};
      evaluation.results.forEach(({ relevantComponents }) => {
        relevantComponents.forEach(({ symbol, value }) => {
          if (typeof value === 'number' && isFinite(value)) {
            values[symbol] = value;
          }
        });
      });
      return values;
    };
    const v1 = valuesOf(e1);
    const v2 = valuesOf(e2);

    // What this analysis would report if nothing were missing — so a component
    // it never interprets is not counted as an omission.
    const reportable: { [symbol: string]: true } = {};
    getReportableSymbols(entry.analysis).forEach((s) => { reportable[s] = true; });
    // Landmarks neither tracing carries: the worklist that would unlock the
    // measurements this analysis contributes nothing to.
    e1.missingSymbols.forEach((s) => {
      if (e2.missingSymbols.indexOf(s) !== -1) {
        missingBoth[s] = true;
      }
    });

    const rows: ChangeRow[] = [];
    // Walk the analysis' own component order so rows read in the order the
    // Summary dialog and the report list them.
    entry.analysis.components.forEach(({ landmark }) => {
      const symbol = landmark.symbol;
      if (seen[symbol] === true) {
        return;
      }
      const has1 = v1[symbol] !== undefined;
      const has2 = v2[symbol] !== undefined;
      if (has1 !== has2) {
        oneSided[symbol] = true;
        return;
      }
      if (!has1) {
        if (reportable[symbol] === true) {
          neither[symbol] = true;
        }
        return;
      }
      seen[symbol] = true;
      const definition = e1.landmarksBySymbol[symbol] || landmark;
      const change = v2[symbol] - v1[symbol];
      const kind = measurementKind(definition);
      const scale = scales[kind];
      scale.count += 1;
      scale.max = Math.max(scale.max, Math.abs(change));
      rows.push({
        symbol,
        name: definition.name !== undefined && definition.name !== symbol
          ? definition.name
          : null,
        landmark: definition,
        t1: v1[symbol],
        t2: v2[symbol],
        change,
        kind,
        isWithinError: isWithinPlottingError(kind, change),
      });
    });

    if (rows.length > 0) {
      rowCount += rows.length;
      groups.push({
        analysisId: entry.id,
        analysisName: entry.name,
        rows,
      });
    }
  });

  // A measurement listed in the table, or computable on one film, is not an
  // omission — whichever analysis reached it first.
  const oneSidedSymbols = Object.keys(oneSided).filter((s) => seen[s] !== true);
  const neitherSymbols = Object.keys(neither)
    .filter((s) => seen[s] !== true && oneSided[s] !== true);
  let withinErrorCount = 0;
  groups.forEach((group) => {
    group.rows.forEach((row) => {
      if (row.isWithinError) {
        withinErrorCount += 1;
      }
    });
  });

  return {
    groups,
    rowCount,
    oneSidedCount: oneSidedSymbols.length,
    neitherCount: neitherSymbols.length,
    neitherSymbols,
    missingBothSymbols: Object.keys(missingBoth).sort(),
    withinErrorCount,
    isLinearPendingScale,
    scales,
  };
};

// ---- Elapsed interval -------------------------------------------------------

/**
 * The interval between two capture dates ("1 y 4 mo", "7 mo", "12 days"), or
 * null when either date is unknown. Growth is read per unit time, so the
 * interval belongs beside every change figure.
 *
 * Re-exported, not defined here: the records dashboard states the same elapsed
 * time as its record span, and the two surfaces printed one pair of dates two
 * ways ("1 y 4 m" there, "1 y 4 mo" here). The one implementation lives beside
 * the capture-date helpers it measures — see `utils/records#formatInterval`,
 * which also documents why months are `mo` in a view full of millimetres.
 */
export { formatInterval } from 'utils/records';
