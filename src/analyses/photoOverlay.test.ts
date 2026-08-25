import expect from 'expect';

import {
  REGISTRATION_SYMBOLS,
  hasRegistrationSources,
  solvePhotoRegistration,
  buildOverlayLines,
} from './photoOverlay';
import { applyTransform, LandmarkMap, Transform } from 'analyses/superimposition';

/** Float comparison — the expect@1 shim has no toBeCloseTo. */
const near = (a: number, b: number, eps: number = 1e-6): boolean =>
  Math.abs(a - b) < eps;

const det = (t: Transform): number => t.a * t.d - t.b * t.c;

/** A right-facing ceph's registration pair, plus a third point to carry along. */
const cephPn = { x: 700, y: 400 };
const cephPog = { x: 650, y: 900 };
const third = { x: 620, y: 700 }; // roughly a lip, between the two

describe('solvePhotoRegistration', () => {
  it('is the identity when the photo points equal the ceph points, unflipped', () => {
    const t = solvePhotoRegistration(cephPn, cephPog, cephPn, cephPog, false, 1000);
    expect(t).toExist();
    const p = applyTransform(t as Transform, third);
    expect(near(p.x, third.x)).toBe(true);
    expect(near(p.y, third.y)).toBe(true);
    expect(det(t as Transform) > 0).toBe(true);
  });

  it('recovers a known similarity (k, θ, translation) exactly', () => {
    const k = 2.25;
    const theta = Math.PI / 7;
    const tx = 150;
    const ty = -40;
    const map = (p: { x: number; y: number }) => ({
      x: k * (Math.cos(theta) * p.x - Math.sin(theta) * p.y) + tx,
      y: k * (Math.sin(theta) * p.x + Math.cos(theta) * p.y) + ty,
    });
    const t = solvePhotoRegistration(
      cephPn, cephPog, map(cephPn), map(cephPog), false, 1000,
    );
    expect(t).toExist();
    const p = applyTransform(t as Transform, third);
    const q = map(third);
    expect(near(p.x, q.x)).toBe(true);
    expect(near(p.y, q.y)).toBe(true);
    // A 2-point similarity is never a reflection.
    expect(det(t as Transform) > 0).toBe(true);
  });

  it('maps through the film midline mirror when flipped, with a negative determinant', () => {
    const W = 1000;
    const mirror = (p: { x: number; y: number }) => ({ x: W - p.x, y: p.y });
    // The photograph faces the other way: its points are the mirrored ceph
    // geometry, so the solved transform must be exactly the mirror.
    const t = solvePhotoRegistration(
      cephPn, cephPog, mirror(cephPn), mirror(cephPog), true, W,
    );
    expect(t).toExist();
    const p = applyTransform(t as Transform, third);
    const q = mirror(third);
    expect(near(p.x, q.x)).toBe(true);
    expect(near(p.y, q.y)).toBe(true);
    expect(det(t as Transform) < 0).toBe(true);
  });

  it('composes the mirror with a further similarity in one matrix', () => {
    const W = 800;
    const k = 0.5;
    const theta = -Math.PI / 5;
    const tx = 60;
    const ty = 90;
    const mirror = (p: { x: number; y: number }) => ({ x: W - p.x, y: p.y });
    const sim = (p: { x: number; y: number }) => ({
      x: k * (Math.cos(theta) * p.x - Math.sin(theta) * p.y) + tx,
      y: k * (Math.sin(theta) * p.x + Math.cos(theta) * p.y) + ty,
    });
    const expected = (p: { x: number; y: number }) => sim(mirror(p));
    const t = solvePhotoRegistration(
      cephPn, cephPog, expected(cephPn), expected(cephPog), true, W,
    );
    expect(t).toExist();
    const p = applyTransform(t as Transform, third);
    const q = expected(third);
    expect(near(p.x, q.x)).toBe(true);
    expect(near(p.y, q.y)).toBe(true);
    expect(det(t as Transform) < 0).toBe(true);
  });

  it('returns null — never NaN — for coincident ceph points', () => {
    const t = solvePhotoRegistration(
      cephPn, { x: cephPn.x, y: cephPn.y },
      { x: 100, y: 100 }, { x: 200, y: 300 },
      false, 1000,
    );
    expect(t).toBe(null);
  });

  it('returns null — never NaN — for coincident photo clicks', () => {
    const click = { x: 240, y: 310 };
    const t = solvePhotoRegistration(
      cephPn, cephPog, click, { x: click.x, y: click.y }, false, 1000,
    );
    expect(t).toBe(null);
  });
});

describe('buildOverlayLines', () => {
  const pn = { x: 700, y: 400 };
  const pog = { x: 650, y: 900 };
  const sn = { x: 660, y: 520 };

  it('names the two registration landmarks the clinician clicks', () => {
    expect(REGISTRATION_SYMBOLS).toEqual(['Pn', "Pog'"]);
  });

  it('draws nothing without the registration pair', () => {
    expect(buildOverlayLines({})).toEqual([]);
    expect(buildOverlayLines({ 'Pn': pn } as LandmarkMap)).toEqual([]);
    expect(hasRegistrationSources({ 'Pn': pn } as LandmarkMap)).toBe(false);
  });

  it('draws the E-line alone when only Pn and Pog′ are placed', () => {
    const map: LandmarkMap = { 'Pn': pn, "Pog'": pog };
    expect(hasRegistrationSources(map)).toBe(true);
    const lines = buildOverlayLines(map);
    expect(lines.length).toBe(1);
    expect(lines[0].id).toBe('e-line');
    // Extended 15% past both endpoints, along Pn → Pog'.
    const dx = pog.x - pn.x;
    const dy = pog.y - pn.y;
    expect(near(lines[0].x1, pn.x - 0.15 * dx)).toBe(true);
    expect(near(lines[0].y1, pn.y - 0.15 * dy)).toBe(true);
    expect(near(lines[0].x2, pog.x + 0.15 * dx)).toBe(true);
    expect(near(lines[0].y2, pog.y + 0.15 * dy)).toBe(true);
  });

  it('adds the S-line from midpoint(Pn, Sn) once Sn is placed', () => {
    const lines = buildOverlayLines({ 'Pn': pn, "Pog'": pog, 'Sn': sn });
    expect(lines.length).toBe(2);
    expect(lines[1].id).toBe('s-line');
    const mid = { x: (pn.x + sn.x) / 2, y: (pn.y + sn.y) / 2 };
    const dx = pog.x - mid.x;
    const dy = pog.y - mid.y;
    expect(near(lines[1].x1, mid.x - 0.15 * dx)).toBe(true);
    expect(near(lines[1].y1, mid.y - 0.15 * dy)).toBe(true);
    expect(near(lines[1].x2, pog.x + 0.15 * dx)).toBe(true);
    expect(near(lines[1].y2, pog.y + 0.15 * dy)).toBe(true);
  });

  it('ignores a non-point value stored under a registration symbol', () => {
    const map: LandmarkMap = {
      'Pn': pn,
      "Pog'": { x1: 0, y1: 0, x2: 1, y2: 1 } as any,
    };
    expect(hasRegistrationSources(map)).toBe(false);
    expect(buildOverlayLines(map)).toEqual([]);
  });
});
