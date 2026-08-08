import { defaultInterpetLandmark } from 'analyses/helpers';

import {
  L1_INCISAL_EDGE, U1_INCISAL_EDGE, U1_APEX,
} from 'analyses/landmarks/points/skeletal';

import {
  functionalOcclusalPlane,
} from 'analyses/landmarks/lines/dental';

import {
  upperFirstMolarCusp, lowerFirstMolarCusp, lowerFirstPremolarCusp,
} from 'analyses/landmarks/points/dental';

/**
 * Overjet and overbite — the two incisor relationships an orthodontic or
 * orthognathic plan is built around.
 *
 * Both are *signed*, and both are measured against the functional occlusal
 * plane, exactly as the Wits appraisal already is in this app (see
 * `analyses/landmarks/distances/skeletal#witsAppraisal`):
 *
 *   * **Overjet** is the horizontal component of (U1 edge − L1 edge) along the
 *     plane's anterior direction. Positive is a normal overjet; negative is a
 *     reverse overjet (anterior crossbite), which is the whole reason the value
 *     must not be an unsigned length.
 *   * **Overbite** is the vertical component of the same difference,
 *     perpendicular to the plane. Positive is overlap of the lower incisor by
 *     the upper; negative is an open bite.
 *
 * The plane's anterior direction is intrinsic to it (molar cusp centre →
 * premolar cusp centre). Its *superior* perpendicular is taken from the upper
 * incisor's own axis — the root apex is superior to the incisal edge on any
 * film — so neither value depends on the radiograph being hung perfectly
 * upright.
 */

interface Unit { ux: number; uy: number; }

/** Anterior unit direction of the occlusal plane, or null on a degenerate one. */
const anteriorOf = (plane: GeoVector): Unit | null => {
  const dx = plane.x2 - plane.x1;
  const dy = plane.y2 - plane.y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!isFinite(len) || len === 0) {
    return null;
  }
  return { ux: dx / len, uy: dy / len };
};

/**
 * The perpendicular to the plane that points *superiorly*, decided against the
 * upper incisor's own axis (edge → apex runs superiorly).
 */
const superiorOf = (
  ant: Unit, u1Edge: GeoPoint, u1Apex: GeoPoint,
): Unit => {
  const candidate: Unit = { ux: -ant.uy, uy: ant.ux };
  const axisX = u1Apex.x - u1Edge.x;
  const axisY = u1Apex.y - u1Edge.y;
  return (candidate.ux * axisX + candidate.uy * axisY) >= 0
    ? candidate
    : { ux: ant.uy, uy: -ant.ux };
};

/**
 * Overjet: the horizontal overlap of the incisors, along the functional
 * occlusal plane. Positive when the upper incisal edge lies anterior to the
 * lower (a normal or increased overjet); negative in an anterior crossbite.
 */
export const overjet: CephLandmark = {
  name: 'Horizontal incisor overlap',
  description:
    'Signed horizontal overlap of the incisal edges, measured along the ' +
    'functional occlusal plane. Negative is a reverse overjet.',
  type: 'distance',
  symbol: 'Overjet',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [functionalOcclusalPlane, U1_INCISAL_EDGE, L1_INCISAL_EDGE],
  // The drawn segment runs from the lower incisal edge to the upper one, so
  // the figure shows the very difference the value reports.
  map: (_occlusalPlane: GeoVector, u1Tip: GeoPoint, l1Tip: GeoPoint) => ({
    x1: l1Tip.x, y1: l1Tip.y, x2: u1Tip.x, y2: u1Tip.y,
  }),
  calculate: () => (
    occlusalPlane: GeoVector, u1Tip: GeoPoint, l1Tip: GeoPoint,
  ) => () => {
    const ant = anteriorOf(occlusalPlane);
    if (ant === null) {
      return 0;
    }
    return (u1Tip.x - l1Tip.x) * ant.ux + (u1Tip.y - l1Tip.y) * ant.uy;
  },
  interpret(value, min, max, mean): Array<LandmarkInterpretation<'overjet'>> {
    if (value < 0) {
      return [{
        category: 'overjet',
        indication: 'negative',
        max, min, mean, value,
      }];
    }
    return defaultInterpetLandmark(
      'overjet',
      ['decreased', 'normal', 'increased'],
    )(value, min, max, mean);
  },
};

/**
 * Overbite: the vertical overlap of the incisors, perpendicular to the
 * functional occlusal plane. Positive when the upper incisal edge sits
 * inferior to the lower one (the upper overlaps the lower); negative is an
 * anterior open bite.
 */
export const overbite: CephLandmark = {
  name: 'Vertical incisor overlap',
  description:
    'Signed vertical overlap of the incisal edges, measured perpendicular ' +
    'to the functional occlusal plane. Negative is an open bite.',
  type: 'distance',
  symbol: 'Overbite',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [
    functionalOcclusalPlane, U1_INCISAL_EDGE, L1_INCISAL_EDGE, U1_APEX,
  ],
  map: (
    _occlusalPlane: GeoVector, u1Tip: GeoPoint, l1Tip: GeoPoint,
  ) => ({
    x1: l1Tip.x, y1: l1Tip.y, x2: u1Tip.x, y2: u1Tip.y,
  }),
  calculate: () => (
    occlusalPlane: GeoVector,
    u1Tip: GeoPoint,
    l1Tip: GeoPoint,
    u1Apex: GeoPoint,
  ) => () => {
    const ant = anteriorOf(occlusalPlane);
    if (ant === null) {
      return 0;
    }
    const up = superiorOf(ant, u1Tip, u1Apex);
    // Positive when the lower edge is superior to the upper edge — i.e. the
    // upper incisor overlaps the lower one.
    return (l1Tip.x - u1Tip.x) * up.ux + (l1Tip.y - u1Tip.y) * up.uy;
  },
  interpret(value, min, max, mean): Array<LandmarkInterpretation<'overbite'>> {
    if (value < 0) {
      return [{
        category: 'overbite',
        indication: 'negative',
        max, min, mean, value,
      }];
    }
    return defaultInterpetLandmark(
      'overbite',
      ['decreased', 'normal', 'increased'],
    )(value, min, max, mean);
  },
};

/**
 * The antero-posterior relationship of the first molars, as a signed
 * millimetre distance along the functional occlusal plane: positive when the
 * lower molar cusp lies **mesial** (anterior) to the upper one, which is the
 * Class III direction, negative when it lies distal, the Class II one.
 *
 * It is reported **without a norm, and without a class**, and the distinction
 * matters. Angle's classification is read from the mesiobuccal cusp of the
 * upper molar against the buccal groove of the lower — two features of the
 * crown that a lateral cephalogram superimposes both sides of and that this
 * app plots as a single "cusp of the first molar" each. The distance between
 * those two plotted points is a real, reproducible measurement of how the
 * arches sit against each other, and it is the quantity a space analysis or a
 * VTO needs; it is *not* Angle's class, and printing "Class I" from it would be
 * claiming a reading this film cannot give. The class belongs on the study
 * models or in the mouth.
 */
export const molarRelationship: CephLandmark = {
  name: 'Molar relationship',
  description:
    'Signed distance from the lower first-molar cusp to the upper one along ' +
    'the functional occlusal plane. Positive = lower molar mesial to the ' +
    'upper (Class III direction). Not Angle\'s classification.',
  type: 'distance',
  symbol: 'Molar rel.',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [
    functionalOcclusalPlane, upperFirstMolarCusp, lowerFirstMolarCusp,
  ],
  map: (_plane: GeoVector, u6: GeoPoint, l6: GeoPoint) => ({
    x1: u6.x, y1: u6.y, x2: l6.x, y2: l6.y,
  }),
  calculate: () => (
    occlusalPlane: GeoVector, u6: GeoPoint, l6: GeoPoint,
  ) => () => {
    const ant = anteriorOf(occlusalPlane);
    if (ant === null) {
      return 0;
    }
    return (l6.x - u6.x) * ant.ux + (l6.y - u6.y) * ant.uy;
  },
};

/**
 * Depth of the curve of Spee in the lower arch: the perpendicular distance
 * from the lower first-premolar cusp — the deepest point of the curve on an
 * ordinary arch — to the line joining the lower incisal edge and the lower
 * first-molar cusp. Positive for the usual concave curve, negative for a
 * reversed one.
 *
 * Every point it needs is already plotted for the occlusal plane and the
 * incisor axes, so it costs the clinician nothing, and it is the measurement
 * that says how much arch length levelling the bite will consume.
 *
 * **No norm is stated.** The figures in circulation ("flat to 2 mm", "1.5 mm
 * average") are clinical rules of thumb read on study models, over the whole
 * buccal segment and with the canine included; this is a three-point
 * approximation on one film. The depth is honest, a norm for it would not be.
 */
export const curveOfSpeeDepth: CephLandmark = {
  name: 'Curve of Spee depth',
  description:
    'Perpendicular distance from the lower first-premolar cusp to the line ' +
    'from the lower incisal edge to the lower first-molar cusp. Positive is ' +
    'the usual concave curve; negative is a reversed curve.',
  type: 'distance',
  symbol: 'Spee',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [
    functionalOcclusalPlane, U1_INCISAL_EDGE, U1_APEX,
    L1_INCISAL_EDGE, lowerFirstPremolarCusp, lowerFirstMolarCusp,
  ],
  map: (
    _plane: GeoVector, _u1Tip: GeoPoint, _u1Apex: GeoPoint,
    l1Tip: GeoPoint, _l4: GeoPoint, l6: GeoPoint,
  ) => ({
    x1: l1Tip.x, y1: l1Tip.y, x2: l6.x, y2: l6.y,
  }),
  calculate: () => (
    occlusalPlane: GeoVector,
    u1Tip: GeoPoint, u1Apex: GeoPoint,
    l1Tip: GeoPoint, l4: GeoPoint, l6: GeoPoint,
  ) => () => {
    const ant = anteriorOf(occlusalPlane);
    if (ant === null) {
      return 0;
    }
    // Which way is up is decided from the upper incisor's own axis, exactly as
    // the overbite decides it — the film need not hang perfectly upright.
    const up = superiorOf(ant, u1Tip, u1Apex);
    const chordX = l6.x - l1Tip.x;
    const chordY = l6.y - l1Tip.y;
    const len = Math.sqrt(chordX * chordX + chordY * chordY);
    if (!isFinite(len) || len === 0) {
      return 0;
    }
    // Signed distance of L4 from the incisor-to-molar chord, positive when it
    // lies inferior to it (a concave curve of Spee).
    const offX = l4.x - l1Tip.x;
    const offY = l4.y - l1Tip.y;
    const along = (offX * chordX + offY * chordY) / (len * len);
    const perpX = offX - along * chordX;
    const perpY = offY - along * chordY;
    return -(perpX * up.ux + perpY * up.uy);
  },
};
