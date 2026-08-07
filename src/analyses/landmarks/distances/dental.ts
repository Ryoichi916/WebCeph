import { defaultInterpetLandmark } from 'analyses/helpers';

import {
  L1_INCISAL_EDGE, U1_INCISAL_EDGE, U1_APEX,
} from 'analyses/landmarks/points/skeletal';

import {
  functionalOcclusalPlane,
} from 'analyses/landmarks/lines/dental';

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
