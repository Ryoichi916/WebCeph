import { distance, line, defaultInterpetLandmark } from 'analyses/helpers';

import {
  A, B, S, N, Go, Me, ANS, L1_APEX,
} from 'analyses/landmarks/points/skeletal';

import {
  NPog, dentalPlane,
} from 'analyses/landmarks/lines/skeletal';

import {
  functionalOcclusalPlane,
} from 'analyses/landmarks/lines/dental';

import {
  createPerpendicular,
  getIntersectionPoint,
  getSegmentLength,
} from 'utils/math';

export const convexityAtPointA: CephDistance = {
  ...distance(A, NPog),
  interpret: defaultInterpetLandmark(
    'skeletalPattern',
    ['class3', 'class1', 'class2'],
  ),
};

export const mandibularIncisorToDentalPlane: CephDistance = {
  ...distance(L1_APEX, dentalPlane),
  interpret: defaultInterpetLandmark(
    'lowerIncisorInclination',
    ['lingual', 'normal', 'labial'],
  )
};

/**
 * Projects a point perpendicularly onto a line and returns the foot of the
 * perpendicular (the point on the line closest to the given point).
 */
const projectPointOntoLine = (p: GeoPoint, l: GeoVector): GeoPoint => {
  return getIntersectionPoint(l, createPerpendicular(l, p)) as GeoPoint;
};

/**
 * Wits appraisal.
 *
 * Perpendiculars are dropped from point A and point B onto the functional
 * occlusal plane; their feet are labelled AO and BO. The Wits value is the
 * *signed* distance between AO and BO measured **along** the occlusal plane.
 *
 * The occlusal plane runs from the molar cusp centre (posterior) to the
 * premolar cusp centre (anterior), so its direction vector points anteriorly.
 * We measure AO − BO along that anterior direction: when AO lies ahead of BO
 * (a skeletal Class II tendency) the value is positive, when it lies behind
 * (Class III) it is negative. Norm ≈ 0 ± 2 mm.
 *
 * Because projection onto a line is linear, AO − BO equals the projection of
 * (A − B) onto the plane, so the signed value is simply the scalar projection
 * of (A − B) onto the plane's anterior unit direction.
 */
export const witsAppraisal: CephLandmark = {
  name: 'Wits appraisal',
  symbol: 'Wits',
  type: 'distance',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [functionalOcclusalPlane, A, B],
  map: (occlusalPlane: GeoVector, geoA: GeoPoint, geoB: GeoPoint) => {
    const AO = projectPointOntoLine(geoA, occlusalPlane);
    const BO = projectPointOntoLine(geoB, occlusalPlane);
    // The mapped segment runs from BO to AO along the occlusal plane.
    return { x1: BO.x, y1: BO.y, x2: AO.x, y2: AO.y };
  },
  calculate: () => (occlusalPlane: GeoVector, geoA: GeoPoint, geoB: GeoPoint) => () => {
    // Anterior unit direction of the occlusal plane (molar → premolar).
    const dx = occlusalPlane.x2 - occlusalPlane.x1;
    const dy = occlusalPlane.y2 - occlusalPlane.y1;
    const planeLength = Math.sqrt(dx * dx + dy * dy);
    if (planeLength === 0) {
      return 0;
    }
    const ux = dx / planeLength;
    const uy = dy / planeLength;
    // Scalar projection of (A − B) onto the anterior direction. Positive when
    // AO lies ahead of BO (Class II tendency), negative when behind (Class III).
    return (geoA.x - geoB.x) * ux + (geoA.y - geoB.y) * uy;
  },
  interpret: defaultInterpetLandmark(
    'skeletalPattern',
    ['class3', 'class1', 'class2'],
  ),
};

/**
 * Jarabak's anterior/posterior facial-height ratio.
 *
 * Posterior facial height (S–Go) divided by anterior facial height (N–Me),
 * expressed as a percentage. A ratio is unitless, so this landmark carries no
 * linear unit and is deliberately *not* scaled by the mm/px calibration (the
 * scale factor cancels in the quotient). Norm ≈ 62–65 %; a higher ratio marks
 * a horizontal (low-angle) grower, a lower ratio a vertical (high-angle) one.
 */
export const posteriorAnteriorFacialHeightRatio: CephLandmark = {
  name: 'Posterior / anterior facial height ratio (S-Go / N-Me)',
  symbol: 'S-Go/N-Me',
  type: 'ratio',
  // A percentage, not a length: the mm/px scale factor cancels in the quotient,
  // so the unit is carried explicitly rather than left blank (a bare "72.8" in
  // a clinical table could be read as degrees or millimetres).
  unit: 'percent',
  imageType: 'ceph_lateral',
  components: [line(S, Go), line(N, Me)],
  calculate: () => (posterior: GeoVector, anterior: GeoVector) => () => {
    const posteriorHeight = getSegmentLength(posterior);
    const anteriorHeight = getSegmentLength(anterior);
    if (anteriorHeight === 0) {
      return 0;
    }
    return (posteriorHeight / anteriorHeight) * 100;
  },
  interpret: defaultInterpetLandmark(
    'growthPattern',
    // Low ratio ⇒ vertical grower, high ratio ⇒ horizontal grower.
    ['vertical', 'normal', 'horizontal'],
  ),
};

/**
 * Lower anterior facial height, ANS–Me (a genuine linear length in mm).
 */
export const lowerAnteriorFacialHeight: CephLandmark = {
  name: 'Lower anterior facial height (ANS-Me)',
  symbol: 'ANS-Me',
  type: 'distance',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [line(ANS, Me)],
  calculate: () => (segment: GeoVector) => () => getSegmentLength(segment),
};
