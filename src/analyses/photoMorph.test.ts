import expect from 'expect';

import {
  mlsPoint, mlsDisplacementAt, assembleMorphControls, buildRoi, anchorRing,
  buildMorphField, sampleField, MorphControl,
} from './photoMorph';
import { applySimulation, EMPTY_PLAN } from './simulation';
import { Transform, LandmarkMap } from './superimposition';

/** Float comparison for hand-computed expectations. */
const near = (a: number, b: number, tol: number = 1e-6): boolean =>
  Math.abs(a - b) < tol;

const IDENTITY: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

describe('MLS photo-morph geometry', () => {
  it('is the identity when every control is at its target', () => {
    const controls: MorphControl[] = [
      { from: { x: 100, y: 100 }, to: { x: 100, y: 100 } },
      { from: { x: 300, y: 120 }, to: { x: 300, y: 120 } },
      { from: { x: 200, y: 320 }, to: { x: 200, y: 320 } },
    ];
    const d = mlsDisplacementAt({ x: 180, y: 210 }, controls);
    expect(near(d.x, 0)).toBe(true);
    expect(near(d.y, 0)).toBe(true);
  });

  it('reproduces a uniform translation exactly (similarity reproduction)', () => {
    const t = { x: 12, y: -7 };
    const controls: MorphControl[] = [
      { x: 100, y: 100 }, { x: 320, y: 90 }, { x: 210, y: 330 },
    ].map((p) => ({ from: p, to: { x: p.x + t.x, y: p.y + t.y } }));
    // Any sample point moves by exactly the translation.
    const d = mlsDisplacementAt({ x: 500, y: 480 }, controls);
    expect(near(d.x, t.x)).toBe(true);
    expect(near(d.y, t.y)).toBe(true);
  });

  it('hits the target at a moving control, holds anchors, and decays with distance', () => {
    const target = { x: -20, y: 0 };
    const moving: MorphControl = {
      from: { x: 200, y: 200 },
      to: { x: 200 + target.x, y: 200 + target.y },
    };
    const anchors: MorphControl[] = [
      { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      { from: { x: 400, y: 0 }, to: { x: 400, y: 0 } },
      { from: { x: 0, y: 400 }, to: { x: 0, y: 400 } },
      { from: { x: 400, y: 400 }, to: { x: 400, y: 400 } },
    ];
    const controls = [moving, ...anchors];
    // At the control itself: exactly the target displacement.
    const atControl = mlsDisplacementAt({ x: 200, y: 200 }, controls);
    expect(near(atControl.x, target.x)).toBe(true);
    expect(near(atControl.y, target.y)).toBe(true);
    // At each anchor: held (exactly, by the snap rule).
    anchors.forEach((a) => {
      const d = mlsDisplacementAt(a.from, controls);
      expect(near(d.x, 0)).toBe(true);
      expect(near(d.y, 0)).toBe(true);
    });
    // Along a ray away from the moving control, the magnitude decays.
    const mag = (px: number) => {
      const d = mlsDisplacementAt({ x: px, y: 200 }, controls);
      return Math.hypot(d.x, d.y);
    };
    const m1 = mag(210);
    const m2 = mag(240);
    const m3 = mag(300);
    expect(m1 > m2).toBe(true);
    expect(m2 > m3).toBe(true);
  });

  it('assembles controls from plotted soft points, anchor fallbacks, and pins the cranium', () => {
    // Ls plotted directly; Li unplotted but B (its PROFILE_ANCHOR) plotted;
    // N plotted -> pinned. The palatal pair gives the simulation its
    // reference; 0.1 mm/px calibration.
    const map: LandmarkMap = {
      'PNS': { x: 100, y: 500 },
      'ANS': { x: 500, y: 500 },
      'N': { x: 560, y: 200 },
      'Me': { x: 520, y: 900 },
      'U1 Apex': { x: 540, y: 560 },
      'U1 Incisal Edge': { x: 570, y: 660 },
      'Ls': { x: 620, y: 650 },
      'B': { x: 560, y: 760 },
    };
    const sim = applySimulation(map, { ...EMPTY_PLAN, u1Mm: -4 }, 0.1);
    const controls = assembleMorphControls(map, sim, IDENTITY);
    // Ls: from its own plotted position, displaced 0.4 x (-40, 0) = (-16, 0).
    const ls = controls.filter((c) => c.from.x === 620 && c.from.y === 650)[0];
    expect(ls === undefined).toBe(false);
    expect(near(ls.to.x - ls.from.x, -16)).toBe(true);
    // Li: stands on B's position; a u1-only plan gives it zero displacement.
    const li = controls.filter((c) => c.from.x === 560 && c.from.y === 760)[0];
    expect(li === undefined).toBe(false);
    expect(near(li.to.x - li.from.x, 0)).toBe(true);
    // N: pinned exactly.
    const n = controls.filter((c) => c.from.x === 560 && c.from.y === 200)[0];
    expect(n === undefined).toBe(false);
    expect(n.to).toEqual(n.from);
  });

  it('builds a padded ROI, an identity edge ring, and a seam-free sampled field', () => {
    const moving: MorphControl = {
      from: { x: 500, y: 600 }, to: { x: 480, y: 600 },
    };
    const roi = buildRoi([moving], 2000, 2000);
    expect(roi === null).toBe(false);
    // The ROI contains both endpoints with margin on every side.
    expect(roi!.left < 480).toBe(true);
    expect(roi!.left + roi!.width > 500).toBe(true);
    const ring = anchorRing(roi!);
    const field = buildMorphField([moving, ...ring], roi!, 16);
    // At the ROI's edge the backward field is pinned to (near) zero...
    const edge = sampleField(field, roi!.left, roi!.top);
    expect(Math.hypot(edge.x, edge.y) < 0.75).toBe(true);
    // ...and near the moved target the output pixel reads back toward the
    // source: the backward displacement at `to` points at `from`.
    const atTarget = sampleField(field, 480, 600);
    expect(atTarget.x > 10).toBe(true);
  });
});
