import { defaultInterpetLandmark } from 'analyses/helpers';

import {
  A, B, S, N, Ar, Go, Me, ANS, Pog,
  U1_INCISAL_EDGE, L1_INCISAL_EDGE,
} from 'analyses/landmarks/points/skeletal';

import { centerOfMolarCusps } from 'analyses/landmarks/points/dental';

import {
  NPog, dentalPlane, NA, NB, PtV,
} from 'analyses/landmarks/lines/skeletal';

import {
  functionalOcclusalPlane,
} from 'analyses/landmarks/lines/dental';

import {
  createPerpendicular,
  createVectorFromPoints,
  getIntersectionPoint,
  getSegmentLength,
} from 'utils/math';

/**
 * Signed perpendicular distance from a point to a skeletal reference line,
 * positive when the point lies **anterior** to the line.
 *
 * Every millimetre reading taken against a facial plane has a clinical sign: a
 * point A 2 mm in front of N-Pog and one 2 mm behind it are a convex and a
 * concave profile, and `defaultCalculateLine` only ever returns an unsigned
 * magnitude. The sign is decided against a landmark known to lie *behind* the
 * reference line — sella, for every line in this file — rather than from the
 * direction the film happens to face, so it survives a flipped or rotated
 * radiograph. This is the same signed-projection rule the Wits appraisal and
 * the E-line distances use.
 */
const signedDistanceAnteriorTo = (
  point: CephPoint,
  refLine: CephLandmark,
  posteriorReference: CephPoint,
  name: string,
  symbol: string,
): CephLandmark => ({
  name,
  symbol,
  type: 'distance',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [point, refLine, posteriorReference],
  // Drawn as the perpendicular from the point to the line, so the figure shows
  // exactly the distance the value reports.
  map: (p: GeoPoint, l: GeoVector) => createPerpendicular(l, p),
  calculate: () => (
    p: GeoPoint, l: GeoVector, behind: GeoPoint,
  ) => (perpendicular: GeoVector | undefined) => {
    const magnitude = perpendicular !== undefined
      ? getSegmentLength(perpendicular)
      : 0;
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const sideOf = (q: GeoPoint) => dx * (q.y - l.y1) - dy * (q.x - l.x1);
    const side = sideOf(p);
    const posterior = sideOf(behind);
    if (side === 0 || posterior === 0) {
      return magnitude;
    }
    // Opposite side from the known-posterior landmark ⇒ anterior ⇒ positive.
    return (side > 0) === (posterior > 0) ? -magnitude : magnitude;
  },
});

/**
 * Ricketts' convexity: how far point A stands in front of the facial plane
 * N-Pog. Norm 2 mm ± 2 at age 9, closing about 0.2 mm a year with growth.
 *
 * **Signed**, and it has to be: the whole point of the measurement is that a
 * positive value is a convex (Class II-tending) profile and a negative one a
 * concave (Class III-tending) profile. Reported as an unsigned length — which
 * is what `distance()` alone produces — a chin 1 mm *ahead* of A read as
 * "+1 mm, within norm" instead of the Class III tendency it is, and the
 * landmark's own `skeletalPattern` interpretation could never return `class3`
 * at all, because an unsigned magnitude cannot fall below the lower bound.
 */
export const convexityAtPointA: CephLandmark = {
  ...signedDistanceAnteriorTo(
    A, NPog, S,
    'Convexity at point A (A to N-Pog)', 'A-N-Pog',
  ),
  interpret: defaultInterpetLandmark(
    'skeletalPattern',
    ['class3', 'class1', 'class2'],
  ),
};

/**
 * Ricketts' lower incisor to the A-Pog (dental) plane: how far the lower
 * incisal edge stands in front of the line A-Pog. Norm 1 mm ± 2.
 *
 * Measured from the **incisal edge**, as Ricketts measures it — it was taken
 * from the root apex here, a point 5 mm behind the edge on the demo tracing
 * and on the wrong side of A-Pog, so the reading was neither Ricketts'
 * measurement nor any other author's. And it is signed, for the same reason
 * the convexity above is: an incisor behind A-Pog is the finding.
 */
export const mandibularIncisorToDentalPlane: CephLandmark = {
  ...signedDistanceAnteriorTo(
    L1_INCISAL_EDGE, dentalPlane, S,
    'Lower incisor to the A-Pog plane', 'L1-APog (mm)',
  ),
  interpret: defaultInterpetLandmark(
    'lowerIncisorPosition',
    ['retrusive', 'normal', 'protrusive'],
  ),
};

/**
 * Downs' upper incisor to the A-Pog plane: the tenth of his ten measurements,
 * and the only linear one among them. Norm 2.7 mm ± 1.8.
 */
export const maxillaryIncisorToDentalPlane: CephLandmark = {
  ...signedDistanceAnteriorTo(
    U1_INCISAL_EDGE, dentalPlane, S,
    'Upper incisor to the A-Pog plane', 'U1-APog (mm)',
  ),
  interpret: defaultInterpetLandmark(
    'upperIncisorPosition',
    ['retrusive', 'normal', 'protrusive'],
  ),
};

/**
 * The upper first molar measured against the pterygoid vertical — Ricketts'
 * reading of where the upper molar sits in the maxilla, and the one he uses to
 * decide whether there is room to distalize it.
 *
 * Reported **without a norm**, for two reasons that are worth stating rather
 * than papering over with a plausible number:
 *
 *  - Ricketts' norm is *the patient's age in years + 3 mm* (± 3). It is not a
 *    constant, this module has no access to the patient's age, and an analysis
 *    that printed one adult figure beside a growing child's film would be
 *    inventing a norm (see `NO_NORM`).
 *  - He measures to the **distal surface** of the crown. This landmark set
 *    plots the molar *cusp*, which sits a few millimetres mesial to it, so even
 *    an age-corrected figure would be compared against a slightly different
 *    point.
 *
 * The distance itself is still worth reporting: it is read serially — molar
 * position at T1 against T2 — and a measured value with no norm is honest
 * where an invented one is not.
 */
export const upperMolarToPtV: CephLandmark = signedDistanceAnteriorTo(
  centerOfMolarCusps, PtV, S,
  'Upper first molar to pterygoid vertical', 'U6-PtV',
);

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
 * A straight length between two skeletal points, drawn on the tracing and
 * reported in millimetres.
 *
 * Symbols carry an explicit `(mm)` suffix wherever a *line* of the same two
 * points already exists (`S-N`, `Ar-Go`, `Go-Me` are all drawn lines). Landmark
 * symbols are the app's primary keys: `getStepsForLandmarks` de-duplicates by
 * them and `mapAndCalculateSteps` stores one geometry per symbol, so a length
 * sharing a line's symbol would silently replace it.
 */
const faceHeight = (
  from: CephPoint, to: CephPoint, name: string, symbol: string,
): CephLandmark => ({
  name,
  symbol,
  type: 'distance',
  unit: 'mm',
  imageType: 'ceph_lateral',
  components: [from, to],
  map: (a: GeoPoint, b: GeoPoint) => createVectorFromPoints(a, b),
  calculate: () => (a: GeoPoint, b: GeoPoint) => () => (
    getSegmentLength(createVectorFromPoints(a, b))
  ),
});

/**
 * Total anterior facial height, N–Me: the denominator of Jarabak's
 * growth-direction ratio. Reported as a measured length; its normal value is
 * age- and sex-specific, so this app states no norm for it (see `NO_NORM`).
 */
export const anteriorFacialHeight = faceHeight(
  N, Me, 'Anterior facial height (N-Me)', 'N-Me',
);

/**
 * Total posterior facial height, S–Go. Same caveat as N-Me: measured, not
 * graded, because its published normal value depends on age and sex.
 */
export const posteriorFacialHeight = faceHeight(
  S, Go, 'Posterior facial height (S-Go)', 'S-Go',
);

/**
 * Upper anterior facial height, N–ANS: the numerator of the 45 : 55 split of
 * the anterior face. Measured, not graded — like the other absolute heights,
 * its normal millimetre value is age- and sex-specific.
 */
export const upperAnteriorFacialHeight = faceHeight(
  N, ANS, 'Upper anterior facial height (N-ANS)', 'N-ANS',
);

/**
 * The four sides of Jarabak's polygon, as plain measured lengths.
 *
 * Jarabak drew S-N (anterior cranial base), S-Ar (posterior cranial base),
 * Ar-Go (ramus height) and Go-Me (mandibular body) and read their proportions;
 * their absolute millimetre norms are age- and sex-specific, so this app states
 * none for them (see `NO_NORM`) rather than printing an adult figure next to a
 * child's film. The *proportions* Jarabak grades — the posterior/anterior
 * facial-height ratio and the anterior face-height split — are reported with
 * their published ranges below.
 */
export const anteriorCranialBaseLength = faceHeight(
  S, N, 'Anterior cranial base (S-N)', 'S-N (mm)',
);

export const posteriorCranialBaseLength = faceHeight(
  S, Ar, 'Posterior cranial base (S-Ar)', 'S-Ar (mm)',
);

export const ramusHeight = faceHeight(
  Ar, Go, 'Ramus height (Ar-Go)', 'Ar-Go (mm)',
);

export const mandibularBodyLength = faceHeight(
  Go, Me, 'Mandibular body (Go-Me)', 'Go-Me (mm)',
);

/**
 * The upper share of the anterior facial height: N-ANS as a percentage of
 * N-Me. Jarabak's split of the anterior face is 45 : 55 — upper 45 %, lower
 * (ANS-Me) 55 % — and it is the *proportion*, not either height in millimetres,
 * that is comparable across ages. A ratio, so the mm/px scale cancels and the
 * value is available on an uncalibrated film.
 *
 * Reported with `RANGE`: 43–47 % is the published band around the 45 : 55 rule,
 * not a mean ± 1 SD, so it earns no stars.
 */
export const upperAnteriorFaceHeightShare: CephLandmark = {
  name: 'Upper share of anterior face height (N-ANS / N-Me)',
  symbol: 'N-ANS/N-Me',
  type: 'ratio',
  unit: 'percent',
  imageType: 'ceph_lateral',
  components: [upperAnteriorFacialHeight, anteriorFacialHeight],
  calculate: () => (upper: GeoVector, total: GeoVector) => () => {
    const totalHeight = getSegmentLength(total);
    if (totalHeight === 0) {
      return 0;
    }
    return (getSegmentLength(upper) / totalHeight) * 100;
  },
};

/**
 * Jarabak's posterior/anterior facial-height ratio.
 *
 * Posterior facial height (S–Go) divided by anterior facial height (N–Me),
 * expressed as a percentage. A ratio is unitless, so this landmark carries no
 * linear unit and is deliberately *not* scaled by the mm/px calibration (the
 * scale factor cancels in the quotient). Jarabak's 62–65 % is a published
 * *range*, so the components that use it declare `RANGE`; a higher ratio marks
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
  components: [posteriorFacialHeight, anteriorFacialHeight],
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
 * Steiner's U1-NA: how far the upper incisal edge stands in front of the N-A
 * line. Norm 4 mm; a negative value is a retruded incisor.
 */
export const upperIncisorToNA: CephLandmark = {
  ...signedDistanceAnteriorTo(
    U1_INCISAL_EDGE, NA, S,
    'Upper incisor to N-A', 'U1-NA (mm)',
  ),
  interpret: defaultInterpetLandmark(
    'upperIncisorPosition',
    ['retrusive', 'normal', 'protrusive'],
  ),
};

/**
 * Steiner's L1-NB: how far the lower incisal edge stands in front of the N-B
 * line. Norm 4 mm; a negative value is a retruded incisor.
 */
export const lowerIncisorToNB: CephLandmark = {
  ...signedDistanceAnteriorTo(
    L1_INCISAL_EDGE, NB, S,
    'Lower incisor to N-B', 'L1-NB (mm)',
  ),
  interpret: defaultInterpetLandmark(
    'lowerIncisorPosition',
    ['retrusive', 'normal', 'protrusive'],
  ),
};

/**
 * Steiner's Pog-NB: the prominence of the bony chin in front of the N-B line.
 * Read together with L1-NB — Holdaway's ratio — it says whether the lower
 * incisor may be proclined or must be held.
 */
export const pogonionToNB: CephLandmark = {
  ...signedDistanceAnteriorTo(
    Pog, NB, S,
    'Pogonion to N-B', 'Pog-NB',
  ),
  interpret: defaultInterpetLandmark(
    'chin',
    ['recessive', 'normal', 'prominent'],
  ),
};

/**
 * Holdaway's ratio: how far the lower incisal edge stands in front of N-B,
 * against how far pogonion does.
 *
 * Steiner reported L1-NB and Pog-NB side by side precisely so this ratio could
 * be read off them, and this app already computed both operands and named the
 * ratio in two comments without ever printing it — leaving the reader of the
 * demo case to spot for himself that a chin 3.1 mm in front of N-B sits three
 * times further forward than the incisor at 1.0 mm, which is exactly the
 * finding that says the lower incisor must not be retracted further.
 *
 * Holdaway states the ideal as 1 : 1 and accepts up to 2 : 1; that is a
 * published *range*, with no standard deviation attached, so the component is
 * declared with `RANGE` and carries no star scale.
 *
 * A quotient of two lengths is unitless, so the mm/px scale cancels and the
 * ratio is available on an uncalibrated film even though its two operands are
 * withheld there. It is only defined while pogonion lies in front of N-B: a
 * chin *behind* the line makes the quotient change sign rather than shrink, and
 * a value that flips sign is not a ratio anyone can read, so it is reported as
 * uncomputable (NaN) instead.
 */
export const holdawayRatio: CephLandmark = {
  name: 'Holdaway ratio (L1-NB : Pog-NB)',
  symbol: 'L1-NB : Pog-NB',
  type: 'ratio',
  imageType: 'ceph_lateral',
  components: [lowerIncisorToNB, pogonionToNB],
  calculate: (incisor?: number, chin?: number) => () => () => {
    if (typeof incisor !== 'number' || typeof chin !== 'number') {
      return NaN;
    }
    // Guarded against a chin at or behind N-B (see above) and against the
    // division blowing up as Pog-NB approaches zero.
    if (!(chin > 0.5)) {
      return NaN;
    }
    return incisor / chin;
  },
};

/**
 * Lower anterior facial height, ANS–Me (a genuine linear length in mm).
 *
 * Its symbol carries the `(mm)` suffix because its own component is the *line*
 * `ANS-Me`, and the two shared a symbol: `getStepsForLandmarks` de-duplicates
 * steps by symbol, so the line replaced the length and the measurement silently
 * never reached a table — Wits & vertical listed "Draw line ANS-Me" as a
 * completed step with no value beside it, and Jarabak's face-height split had
 * no lower half to print.
 */
export const lowerAnteriorFacialHeight = faceHeight(
  ANS, Me, 'Lower anterior facial height (ANS-Me)', 'ANS-Me (mm)',
);
