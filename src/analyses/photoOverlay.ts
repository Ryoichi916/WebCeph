import {
  Transform, LandmarkMap, placedPoints,
} from 'analyses/superimposition';

/**
 * Photo overlay: the geometry that carries a completed lateral-ceph tracing's
 * analysis lines onto the patient's profile *photograph*.
 *
 * This module is pure — no store, no DOM — exactly like
 * `analyses/superimposition`, whose `Transform` (SVG `matrix(a b c d e f)`
 * layout) it reuses so the result can be handed to an SVG `transform`
 * attribute untouched.
 *
 * The registration is a **2-point similarity**: the clinician clicks the two
 * landmarks of `REGISTRATION_SYMBOLS` on the photograph, and the transform that
 * maps the ceph's copies of those two points onto the clicks (uniform scale +
 * rotation + translation) is applied to everything drawn. Nothing is ever
 * *measured* on the photograph — posture, perspective and magnification all
 * differ between a projected radiograph and a camera photograph, so the overlay
 * is an approximate visual aid, and every surface that draws it says so.
 */

/**
 * The two ceph landmarks the user marks on the photograph: the nose tip and the
 * soft-tissue chin — the E-line's own endpoints, and the two soft-tissue points
 * most precisely identifiable on an ordinary profile photograph.
 */
export const REGISTRATION_SYMBOLS: string[] = ['Pn', "Pog'"];

/** Whether a tracing carries both registration landmarks as placed points. */
export const hasRegistrationSources = (map: LandmarkMap): boolean => {
  const points = placedPoints(map);
  return REGISTRATION_SYMBOLS.every((symbol) => points[symbol] !== undefined);
};

/** Distances below this are a degenerate registration, not a scale. */
const MIN_SPAN = 1e-6;

/**
 * Solves the 2-point similarity that maps **raw ceph pixel coordinates** to
 * photo pixel coordinates.
 *
 * The maths, in order of application to a ceph point `c`:
 *
 *   1. (when `isFlipped`) mirror about the film's vertical midline,
 *      `x' = cephWidth − x` — see below;
 *   2. `− cephPn`  — move the ceph's nose tip to the origin;
 *   3. `× k·R(θ)` — uniform scale and rotation, where
 *      `k = |photoPog − photoPn| / |cephPog − cephPn|` and
 *      `θ = angle(photoPog − photoPn) − angle(cephPog − cephPn)`;
 *   4. `+ photoPn` — put the nose tip on the clicked one.
 *
 * So `Pn ↦ photoPn` exactly and `Pog' ↦ photoPog` exactly, and everything else
 * rides along rigidly.
 *
 * **Why the explicit `isFlipped` input.** A similarity solved from two point
 * pairs can never produce a reflection — its determinant is `k² > 0` by
 * construction — yet profile photographs are commonly taken facing *left*
 * while cephalograms face right. Fitting a right-facing tracing onto a
 * left-facing photograph without a mirror would fold the tracing's rotation
 * the wrong way instead of turning the profile around. The caller states the
 * facing, the ceph is pre-mirrored about `x = cephWidth / 2`, and the returned
 * single matrix composes the mirror in (its determinant is then negative).
 *
 * Returns null — never NaN — when either point pair is (near-)coincident:
 * a zero span has no direction and no scale.
 */
export const solvePhotoRegistration = (
  cephPn: { x: number; y: number },
  cephPog: { x: number; y: number },
  photoPn: { x: number; y: number },
  photoPog: { x: number; y: number },
  isFlipped: boolean,
  cephWidth: number,
): Transform | null => {
  // The mirrored ceph frame, where the flip asks for one.
  const mirror = (p: { x: number; y: number }) =>
    isFlipped ? { x: cephWidth - p.x, y: p.y } : p;
  const pn = mirror(cephPn);
  const pog = mirror(cephPog);

  const cephDx = pog.x - pn.x;
  const cephDy = pog.y - pn.y;
  const photoDx = photoPog.x - photoPn.x;
  const photoDy = photoPog.y - photoPn.y;
  const cephSpan = Math.hypot(cephDx, cephDy);
  const photoSpan = Math.hypot(photoDx, photoDy);
  if (cephSpan < MIN_SPAN || photoSpan < MIN_SPAN) {
    return null;
  }

  const k = photoSpan / cephSpan;
  const theta = Math.atan2(photoDy, photoDx) - Math.atan2(cephDy, cephDx);
  const cos = Math.cos(theta) * k;
  const sin = Math.sin(theta) * k;

  // The similarity on the (possibly mirrored) ceph frame:
  // p = k·R(θ)·(c' − pn) + photoPn.
  const s: Transform = {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: photoPn.x - (cos * pn.x - sin * pn.y),
    f: photoPn.y - (sin * pn.x + cos * pn.y),
  };
  if (!isFlipped) {
    return s;
  }
  // Compose with the mirror M: x' = −x + cephWidth, y' = y — i.e.
  // M = (−1, 0, 0, 1, cephWidth, 0) — so the returned matrix maps *raw* ceph
  // coordinates: T = S ∘ M.
  return {
    a: -s.a,
    b: -s.b,
    c: s.c,
    d: s.d,
    e: s.a * cephWidth + s.e,
    f: s.b * cephWidth + s.f,
  };
};

// ---- The overlay's reference lines ------------------------------------------

/**
 * How far past each endpoint a reference line is drawn, as a fraction of its
 * own length. A soft-tissue line is read against the lips, which sit *between*
 * its defining points on the E-line and *beside* them on the S-line — drawn
 * strictly endpoint-to-endpoint the line looks clipped against the face.
 */
const LINE_OVERSHOOT = 0.15;

export interface OverlayLine {
  id: 'e-line' | 's-line';
  /** Figure label, matching the analyses' own naming. */
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const extend = (
  id: OverlayLine['id'], label: string,
  p1: { x: number; y: number }, p2: { x: number; y: number },
): OverlayLine => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return {
    id,
    label,
    x1: p1.x - dx * LINE_OVERSHOOT,
    y1: p1.y - dy * LINE_OVERSHOOT,
    x2: p2.x + dx * LINE_OVERSHOOT,
    y2: p2.y + dy * LINE_OVERSHOOT,
  };
};

/**
 * The soft-tissue reference lines the overlay draws, in **raw ceph pixel
 * coordinates** (the same frame `solvePhotoRegistration`'s input expects) —
 * built from the ceph's landmark map exactly as the analyses define them:
 *
 *  - **E-line** (Ricketts): Pn → Pog' — available whenever the registration
 *    pair itself is placed (they are the same two landmarks);
 *  - **S-line** (Steiner): midpoint(Pn, Sn) → Pog' — the same construction as
 *    `analyses/landmarks/lines/soft#SLine`, so it needs Sn as well.
 *
 * Each is visually extended a little past both endpoints (see
 * `LINE_OVERSHOOT`). Lines whose landmarks are not all placed are simply
 * absent, never approximated.
 */
export const buildOverlayLines = (map: LandmarkMap): OverlayLine[] => {
  const points = placedPoints(map);
  const pn = points['Pn'];
  const pog = points["Pog'"];
  const sn = points['Sn'];
  const lines: OverlayLine[] = [];
  if (pn === undefined || pog === undefined) {
    return lines;
  }
  lines.push(extend('e-line', 'E-line', pn, pog));
  if (sn !== undefined) {
    // Same sense as SLine's own map: from the nose down to the chin.
    lines.push(extend(
      's-line', 'S-line',
      { x: (pn.x + sn.x) / 2, y: (pn.y + sn.y) / 2 },
      pog,
    ));
  }
  return lines;
};
