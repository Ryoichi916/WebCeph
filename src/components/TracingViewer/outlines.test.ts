import expect from 'expect';

import {
  buildOutlines, toBezierPath, SOFT_TISSUE_PROFILE_LANDMARKS,
} from './outlines';
import { LandmarkMap } from 'analyses/superimposition';
import { TEMPLATE } from 'predictors/demo';

const near = (a: number, b: number, tol: number = 1e-6): boolean =>
  Math.abs(a - b) < tol;

/**
 * An upright, right-facing tracing: N above Me on a vertical facial axis, so
 * the frame's anterior direction is exactly +x and "posterior of the chord"
 * is a smaller x. Full soft-tissue set (the traced branch's gate) plus the
 * skeletal points every other outline hangs off.
 */
const tracedMap: LandmarkMap = {
  'N': { x: 500, y: 200 },
  'Me': { x: 500, y: 900 },
  'A': { x: 560, y: 620 },
  'B': { x: 540, y: 760 },
  'Pog': { x: 545, y: 830 },
  'N\'': { x: 560, y: 210 },
  'Pn': { x: 680, y: 430 },
  'Sn': { x: 620, y: 500 },
  'Ls': { x: 645, y: 570 },
  'Li': { x: 640, y: 660 },
  'Pog\'': { x: 610, y: 800 },
};

const softTissueOutline = (map: LandmarkMap) =>
  buildOutlines(map).filter((o) => o.id === 'soft-tissue')[0];

const containsPoint = (
  pts: Array<[number, number]>, x: number, y: number,
): boolean => pts.some(([px, py]) => near(px, x) && near(py, y));

describe('Soft-tissue profile: lip concavities', () => {
  it('uses the real sulci and stomion points when they are plotted', () => {
    const map: LandmarkMap = {
      ...tracedMap,
      'Sls': { x: 622, y: 530 },
      'Sts': { x: 630, y: 600 },
      'Sti': { x: 628, y: 625 },
      'Ils': { x: 605, y: 710 },
    };
    const outline = softTissueOutline(map);
    expect(outline === undefined).toBe(false);
    ['Sls', 'Sts', 'Sti', 'Ils'].forEach((symbol) => {
      const p = map[symbol] as { x: number; y: number };
      expect(containsPoint(outline.points as any, p.x, p.y)).toBe(true);
    });
    // Order: Sls between Sn and Ls; Sts before Sti between Ls and Li.
    const xs = (outline.points as any).map(([x, y]: [number, number]) => `${x},${y}`);
    const idx = (s: string) => {
      const p = map[s] as { x: number; y: number };
      return xs.indexOf(`${p.x},${p.y}`);
    };
    expect(idx('Sn') < idx('Sls') && idx('Sls') < idx('Ls')).toBe(true);
    expect(idx('Ls') < idx('Sts') && idx('Sts') < idx('Sti') && idx('Sti') < idx('Li')).toBe(true);
    expect(idx('Li') < idx('Ils') && idx('Ils') < idx('Pog\'')).toBe(true);
  });

  it('synthesises each missing dip posterior of BOTH its neighbours', () => {
    const outline = softTissueOutline(tracedMap);
    expect(outline === undefined).toBe(false);
    const pts = outline.points as Array<[number, number]>;
    // Between each boundary pair there is now exactly one interposed point.
    // For this upright frame the anterior axis is exactly +x, so the dip's x
    // must be depth × facial height (700 px) behind the LESS anterior of its
    // two neighbours — a guaranteed local minimum, not merely "behind the
    // chord" (which fails to dip at all when the chord itself is steeply
    // inclined; see the Class III regression test below).
    const find = (x: number, y: number) =>
      pts.findIndex(([px, py]) => near(px, x) && near(py, y));
    const iSn = find(620, 500);
    const iLs = find(645, 570);
    const iLi = find(640, 660);
    const iPog = find(610, 800);
    expect(iLs - iSn).toBe(2);   // Sn, [sulcus], Ls
    expect(iLi - iLs).toBe(2);   // Ls, [stomion], Li
    expect(iPog - iLi).toBe(2);  // Li, [mentolabial], Pog'
    const sulcus = pts[iSn + 1];
    expect(near(sulcus[0], Math.min(620, 645) - 0.010 * 700)).toBe(true);
    expect(near(sulcus[1], 500 + (570 - 500) * 0.45)).toBe(true);
    const stomion = pts[iLs + 1];
    expect(near(stomion[0], Math.min(645, 640) - 0.012 * 700)).toBe(true);
    expect(near(stomion[1], 570 + (660 - 570) * 0.5)).toBe(true);
    const mentolabial = pts[iLi + 1];
    expect(near(mentolabial[0], Math.min(640, 610) - 0.028 * 700)).toBe(true);
    expect(near(mentolabial[1], 660 + (800 - 660) * 0.45)).toBe(true);
  });

  it('still dips on a Class III profile, where the lips differ a lot in anterior projection', () => {
    // The regression the clinician caught live: on the bundled sample film
    // (ANB −4.2°) the synthesised lower lip sits ~88 px more anterior than
    // the upper, so a dip measured against the Ls–Li CHORD landed in front
    // of Ls itself and the "stomion" rendered as part of one convex bulge.
    // The dip must be a local minimum of the anterior projection against
    // both neighbours, however inclined their chord.
    const map: LandmarkMap = {
      ...tracedMap,
      'Ls': { x: 600, y: 570 },  // upper lip well behind...
      'Li': { x: 700, y: 660 },  // ...a protrusive lower lip
    };
    const outline = softTissueOutline(map);
    expect(outline === undefined).toBe(false);
    const pts = outline.points as Array<[number, number]>;
    const find = (x: number, y: number) =>
      pts.findIndex(([px, py]) => near(px, x) && near(py, y));
    const iLs = find(600, 570);
    const iLi = find(700, 660);
    expect(iLi - iLs).toBe(2);
    const stomion = pts[iLs + 1];
    // Posterior of BOTH lips — with the old chord-relative construction this
    // point sat at x = 650 − 0.018·700 = 637.4, i.e. 37 px ANTERIOR of Ls.
    expect(stomion[0] < 600).toBe(true);
    expect(stomion[0] < 700).toBe(true);
    expect(near(stomion[0], 600 - 0.012 * 700)).toBe(true);
  });

  it('prefers real soft-tissue landmarks in the synthesised-silhouette branch', () => {
    // A 9-of-9 Soft Tissue tracing: every soft point except N' (which no
    // analysis plots) — the gate fails, the synthetic branch runs, and it
    // must use the real Pn/Sn/Ls/Li/Ils/Pog' instead of bone-derived guesses.
    const map: LandmarkMap = {
      'N': { x: 500, y: 200 },
      'Me': { x: 500, y: 900 },
      'A': { x: 560, y: 620 },
      'B': { x: 540, y: 760 },
      'Pog': { x: 545, y: 830 },
      'ANS': { x: 570, y: 590 },
      'G': { x: 555, y: 150 },
      'Pn': { x: 680, y: 430 },
      'Sn': { x: 620, y: 500 },
      'Ls': { x: 645, y: 570 },
      'Li': { x: 640, y: 660 },
      'Ils': { x: 605, y: 710 },
      'Pog\'': { x: 610, y: 800 },
    };
    expect(SOFT_TISSUE_PROFILE_LANDMARKS.every((s) => map[s] !== undefined))
      .toBe(false); // the gate really is failing (N' absent)
    const outline = softTissueOutline(map);
    expect(outline === undefined).toBe(false);
    ['G', 'Pn', 'Sn', 'Ls', 'Li', 'Ils', 'Pog\''].forEach((symbol) => {
      const p = map[symbol] as { x: number; y: number };
      expect(containsPoint(outline.points as any, p.x, p.y)).toBe(true);
    });
  });

  it('keeps the deliberate lip reversals out of the spike guard', () => {
    // Bone-only map (Downs-like): the synthetic branch runs the spike guard
    // on the base silhouette, then splices the dips in — so all three
    // concavities must survive into the final point list.
    const map: LandmarkMap = {
      'N': { x: 500, y: 200 },
      'Me': { x: 500, y: 900 },
      'A': { x: 560, y: 620 },
      'B': { x: 540, y: 760 },
      'Pog': { x: 545, y: 830 },
      'ANS': { x: 570, y: 590 },
    };
    const outline = softTissueOutline(map);
    expect(outline === undefined).toBe(false);
    // Base silhouette is 11 points; the three dips make 14.
    expect(outline.points.length).toBe(14);
  });
});

describe('Synthesised silhouette calibration against the demo template', () => {
  /**
   * The offsets in outlines.ts claim to be "calibrated against the demo
   * film's soft-tissue silhouette". This test makes that claim mechanical:
   * a bone-only tracing at the demo template's own positions must synthesise
   * each soft-tissue slot within a couple of pixels of where the template's
   * REAL soft landmark sits — the position auto-plot itself would place.
   * The clinician caught the lower lip drawn ~88 px too far anterior; these
   * offsets had been eyeballed, and nothing pinned them. Now this does.
   */
  it('lands each synthetic slot on the template\'s real soft landmark', () => {
    const W = 1578;
    const H = 2089;
    const at = (symbol: string) => ({
      x: TEMPLATE[symbol][0] * W,
      y: TEMPLATE[symbol][1] * H,
    });
    const boneOnly: LandmarkMap = {
      'N': at('N'), 'Me': at('Me'), 'A': at('A'), 'B': at('B'),
      'Pog': at('Pog'), 'ANS': at('ANS'),
    };
    const outline = softTissueOutline(boneOnly);
    expect(outline === undefined).toBe(false);
    const pts = outline.points as Array<[number, number]>;
    // Offsets are stored rounded to 3 decimals of facial height (~974 px on
    // this film), so each slot may sit up to ~0.7 px off its target.
    const TOL = 1.5;
    ['G', 'N\'', 'Pn', 'Sn', 'Ls', 'Li', 'Pog\'', 'Me\''].forEach((symbol) => {
      const target = at(symbol);
      const hit = pts.some(([x, y]) =>
        Math.hypot(x - target.x, y - target.y) <= TOL);
      if (!hit) {
        // Name the offender in the failure output.
        const closest = Math.min(
          ...pts.map(([x, y]) => Math.hypot(x - target.x, y - target.y)));
        expect(`${symbol} missed by ${closest.toFixed(1)}px`).toBe('on target');
      }
      expect(hit).toBe(true);
    });
  });

  it('holds for the A-anchored subnasale fallback when ANS is unplotted', () => {
    const W = 1578;
    const H = 2089;
    const at = (symbol: string) => ({
      x: TEMPLATE[symbol][0] * W,
      y: TEMPLATE[symbol][1] * H,
    });
    const noAns: LandmarkMap = {
      'N': at('N'), 'Me': at('Me'), 'A': at('A'), 'B': at('B'),
      'Pog': at('Pog'),
    };
    const outline = softTissueOutline(noAns);
    expect(outline === undefined).toBe(false);
    const target = at('Sn');
    const hit = (outline.points as Array<[number, number]>).some(([x, y]) =>
      Math.hypot(x - target.x, y - target.y) <= 1.5);
    expect(hit).toBe(true);
  });
});

describe('toBezierPath tangent clamp', () => {
  it('leaves evenly spaced curves byte-identical to the unclamped formula', () => {
    const pts: Array<[number, number]> = [
      [0, 0], [100, 10], [200, 0], [300, 10], [400, 0],
    ];
    const bez = toBezierPath(pts, false)!;
    // Reproduce the raw Catmull-Rom control points and compare.
    const p = pts.slice() as Array<[number, number]>;
    p.unshift(pts[0]);
    p.push(pts[pts.length - 1]);
    for (let i = 1; i < p.length - 2; i += 1) {
      const raw1x = p[i][0] + (p[i + 1][0] - p[i - 1][0]) / 6;
      const raw1y = p[i][1] + (p[i + 1][1] - p[i - 1][1]) / 6;
      const [c1x, c1y] = bez.curves[i - 1];
      expect(near(c1x, raw1x)).toBe(true);
      expect(near(c1y, raw1y)).toBe(true);
    }
  });

  it('clamps the tangent across a pathologically short segment', () => {
    // A long chord into two near-coincident points: the raw offset for the
    // short middle segment would be far longer than the segment itself.
    const pts: Array<[number, number]> = [
      [0, 0], [300, 0], [306, 4], [600, 0],
    ];
    const bez = toBezierPath(pts, false)!;
    // The curve for the short segment (index 1: from [300,0] to [306,4]).
    const seg = Math.hypot(6, 4);
    const [c1x, c1y] = bez.curves[1];
    const offset = Math.hypot(c1x - 300, c1y - 0);
    expect(offset <= seg * 0.45 + 1e-9).toBe(true);
  });
});
