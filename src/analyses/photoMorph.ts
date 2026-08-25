/**
 * The geometry of the photo-morph preview: a Moving Least Squares (MLS)
 * deformation — the *similarity* variant of Schaefer, McPhail & Warren,
 * "Image Deformation Using Moving Least Squares" (SIGGRAPH 2006) — driven by
 * the simulation's soft-tissue displacement vectors mapped into photograph
 * space through the photo registration.
 *
 * This module is pure — no DOM, no canvas, no store. It takes control points
 * and returns displacement fields as numbers; the pixel loop that actually
 * resamples the photograph lives in `utils/photoMorphCanvas`.
 *
 * Why the similarity variant: it is the stiffest of the three MLS classes
 * that still reproduces the controls exactly, so at the few-millimetre
 * displacements this app can express it cannot fold or shear the face the
 * way the affine variant can, and unlike the rigid variant it tolerates the
 * slight scale disagreement a two-point photo registration leaves behind.
 *
 * The deformation is an illustration of the plan's published ratios on the
 * photograph — the same honesty contract as the simulation's profile curve.
 * It is not a prediction of appearance, and every surface that renders its
 * output must say so.
 */

import {
  SOFT_TISSUE_RESPONSE, PROFILE_ANCHORS, Vec, Simulation,
} from './simulation';
import { Transform, applyTransform, LandmarkMap } from './superimposition';

export interface MorphControl {
  /** Photo-space position before the plan. */
  from: Vec;
  /** Photo-space position under the plan. */
  to: Vec;
}

/** An axis-aligned photo-space rectangle, in photo pixels. */
export interface Roi {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Below this squared distance (px²) a sample point is considered to *be* a
 * control point, and maps exactly to its target — the MLS weight 1/d^2α is
 * singular there, which is the paper's own definition of interpolation.
 */
const SNAP_SQ = 1e-12;

/** Weight falloff exponent α: w = 1 / |p − v|^(2α). */
const ALPHA = 2;

const isGeoPointLike = (value: any): value is Vec =>
  value !== undefined && value !== null &&
  typeof value.x === 'number' && typeof value.y === 'number';

/**
 * The MLS-similarity image of `v` under the given controls: solves, at `v`,
 * the weighted least-squares similarity (scaled rotation + translation)
 * carrying every `from` toward its `to`, and applies it to `v`. With no
 * controls, or all controls coincident with their targets, this is the
 * identity.
 *
 * The closed form: with weights `w_i`, weighted centroids `p*`/`q*` and
 * centred controls `p̂/q̂`, a 2-D scaled rotation is `[[α, −β], [β, α]]` and
 * the normal equations give `α = Σw(p̂·q̂)/μ`, `β = Σw(p̂×q̂)/μ`,
 * `μ = Σw|p̂|²` — then `f(v) = M(v − p*) + q*`. (Equivalent to the paper's
 * `A_i` formulation; this arrangement is the direct least-squares solve.)
 */
export const mlsPoint = (v: Vec, controls: MorphControl[]): Vec => {
  const n = controls.length;
  if (n === 0) {
    return v;
  }
  let wSum = 0;
  let px = 0;
  let py = 0;
  let qx = 0;
  let qy = 0;
  const weights: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = controls[i];
    const dx = v.x - c.from.x;
    const dy = v.y - c.from.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < SNAP_SQ) {
      return { x: c.to.x, y: c.to.y };
    }
    const w = 1 / Math.pow(distSq, ALPHA);
    weights[i] = w;
    wSum += w;
    px += w * c.from.x;
    py += w * c.from.y;
    qx += w * c.to.x;
    qy += w * c.to.y;
  }
  const pStarX = px / wSum;
  const pStarY = py / wSum;
  const qStarX = qx / wSum;
  const qStarY = qy / wSum;
  let mu = 0;
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i += 1) {
    const c = controls[i];
    const phx = c.from.x - pStarX;
    const phy = c.from.y - pStarY;
    const qhx = c.to.x - qStarX;
    const qhy = c.to.y - qStarY;
    const w = weights[i];
    mu += w * (phx * phx + phy * phy);
    dot += w * (phx * qhx + phy * qhy);
    cross += w * (phx * qhy - phy * qhx);
  }
  // Every centred control at the weighted centroid (e.g. a single control
  // point): no rotation/scale is determined, so translate by the centroids.
  if (mu === 0) {
    return { x: v.x - pStarX + qStarX, y: v.y - pStarY + qStarY };
  }
  const a = dot / mu;
  const b = cross / mu;
  const dx = v.x - pStarX;
  const dy = v.y - pStarY;
  return {
    x: a * dx - b * dy + qStarX,
    y: b * dx + a * dy + qStarY,
  };
};

/** The displacement `mlsPoint` applies at `v` — `f(v) − v`. */
export const mlsDisplacementAt = (v: Vec, controls: MorphControl[]): Vec => {
  const f = mlsPoint(v, controls);
  return { x: f.x - v.x, y: f.y - v.y };
};

/**
 * Assembles the morph's control points in photo space:
 *
 *  - one *moving* control per `SOFT_TISSUE_RESPONSE` row, positioned at the
 *    plotted soft-tissue landmark — or, when it is unplotted, at the bone
 *    anchor that stands in for it in the synthesised silhouette
 *    (`PROFILE_ANCHORS`) — displaced by the simulation's ratio-weighted soft
 *    vector for that symbol (zero when the response is held, which pins the
 *    face still);
 *  - one *pinned* (zero-displacement) control at N (or N′ when plotted),
 *    holding the upper face, since nothing in the simulation moves the
 *    cranium.
 *
 * All positions are mapped through `cephToPhoto` before being returned, so
 * the result is ready for `buildMorphField` on the photograph.
 */
export const assembleMorphControls = (
  cephMap: LandmarkMap,
  simulation: Simulation,
  cephToPhoto: Transform,
): MorphControl[] => {
  const controls: MorphControl[] = [];
  const anchorFor: { [standsFor: string]: string } = {};
  PROFILE_ANCHORS.forEach(({ anchor, standsFor }) => {
    anchorFor[standsFor] = anchor;
  });
  SOFT_TISSUE_RESPONSE.forEach(({ symbol }) => {
    const own = cephMap[symbol];
    const stand = anchorFor[symbol] !== undefined
      ? cephMap[anchorFor[symbol]]
      : undefined;
    const position = isGeoPointLike(own)
      ? own
      : (isGeoPointLike(stand) ? stand : undefined);
    if (position === undefined) {
      return;
    }
    const d = simulation.softVectors[symbol];
    const displaced: Vec = d !== undefined
      ? { x: position.x + d.x, y: position.y + d.y }
      : position;
    controls.push({
      from: applyTransform(cephToPhoto, position),
      to: applyTransform(cephToPhoto, displaced),
    });
  });
  const cranial = ['N\'', 'N']
    .map((s) => cephMap[s])
    .filter(isGeoPointLike)[0];
  if (cranial !== undefined) {
    const fixed = applyTransform(cephToPhoto, cranial);
    controls.push({ from: fixed, to: fixed });
  }
  return controls;
};

/**
 * The photo region the warp is confined to: the bounding box of the moving
 * controls, padded by `padFactor` × the largest displacement plus `minPad`
 * pixels of falloff margin, clamped to the photograph. Everything outside is
 * untouched by construction, so the eyes, forehead and background can never
 * swim.
 */
export const buildRoi = (
  controls: MorphControl[],
  photoWidth: number,
  photoHeight: number,
  padFactor: number = 1.5,
  minPad: number = 48,
): Roi | null => {
  const moving = controls.filter(
    (c) => Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y) > 0,
  );
  const around = moving.length > 0 ? moving : controls;
  if (around.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxDisp = 0;
  around.forEach((c) => {
    minX = Math.min(minX, c.from.x, c.to.x);
    minY = Math.min(minY, c.from.y, c.to.y);
    maxX = Math.max(maxX, c.from.x, c.to.x);
    maxY = Math.max(maxY, c.from.y, c.to.y);
    maxDisp = Math.max(
      maxDisp, Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y),
    );
  });
  const pad = Math.max(minPad, padFactor * maxDisp);
  const left = Math.max(0, Math.floor(minX - pad));
  const top = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(photoWidth, Math.ceil(maxX + pad));
  const bottom = Math.min(photoHeight, Math.ceil(maxY + pad));
  if (right <= left || bottom <= top) {
    return null;
  }
  return { left, top, width: right - left, height: bottom - top };
};

/**
 * Zero-displacement controls spaced around the ROI's border, pinning the
 * warp to the identity at its own edge so the warped patch composites back
 * onto the untouched photograph without a visible seam.
 */
export const anchorRing = (roi: Roi, perSide: number = 3): MorphControl[] => {
  const ring: MorphControl[] = [];
  const pin = (x: number, y: number) => {
    ring.push({ from: { x, y }, to: { x, y } });
  };
  for (let i = 0; i < perSide; i += 1) {
    const t = (i + 0.5) / perSide;
    pin(roi.left + t * roi.width, roi.top);
    pin(roi.left + t * roi.width, roi.top + roi.height);
    pin(roi.left, roi.top + t * roi.height);
    pin(roi.left + roi.width, roi.top + t * roi.height);
  }
  return ring;
};

/**
 * The *backward* displacement field over the ROI, sampled at grid nodes:
 * for an output pixel at node position `o`, the source pixel to read is
 * `o + (dx, dy)`. Solved as the MLS with `from`/`to` swapped — the exact
 * inverse would need iteration, but at the few-px displacements this app can
 * express the swapped solve is indistinguishable and single-pass.
 */
export interface MorphField {
  roi: Roi;
  spacing: number;
  cols: number;
  rows: number;
  dx: Float32Array;
  dy: Float32Array;
}

export const buildMorphField = (
  controls: MorphControl[],
  roi: Roi,
  spacing: number = 24,
): MorphField => {
  const backward: MorphControl[] = controls.map(
    (c) => ({ from: c.to, to: c.from }),
  );
  const cols = Math.max(2, Math.ceil(roi.width / spacing) + 1);
  const rows = Math.max(2, Math.ceil(roi.height / spacing) + 1);
  const dx = new Float32Array(cols * rows);
  const dy = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v: Vec = {
        x: roi.left + (c / (cols - 1)) * roi.width,
        y: roi.top + (r / (rows - 1)) * roi.height,
      };
      const d = mlsDisplacementAt(v, backward);
      dx[r * cols + c] = d.x;
      dy[r * cols + c] = d.y;
    }
  }
  return { roi, spacing, cols, rows, dx, dy };
};

/** Bilinear sample of the backward field at a photo-space point in the ROI. */
export const sampleField = (field: MorphField, x: number, y: number): Vec => {
  const { roi, cols, rows, dx, dy } = field;
  const gx = ((x - roi.left) / roi.width) * (cols - 1);
  const gy = ((y - roi.top) / roi.height) * (rows - 1);
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(gx)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const fx = Math.max(0, Math.min(1, gx - c0));
  const fy = Math.max(0, Math.min(1, gy - r0));
  const lerp = (arr: Float32Array): number => {
    const a = arr[r0 * cols + c0] * (1 - fx) + arr[r0 * cols + c1] * fx;
    const b = arr[r1 * cols + c0] * (1 - fx) + arr[r1 * cols + c1] * fx;
    return a * (1 - fy) + b * fy;
  };
  return { x: lerp(dx), y: lerp(dy) };
};
