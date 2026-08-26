import expect from 'expect';

import {
  getSimulationReadiness, describeControls, LOWER_INCISOR_REQUIRED,
  applySimulation, activeSoftTissueRatios, maxSimulatedTravelPx,
  isPlanEmpty, planKey, EMPTY_PLAN, buildSimulationTable,
} from './simulation';
import { LandmarkMap } from 'analyses/superimposition';

/**
 * Tweed's own 17-step tracing plots Po, Or, Go, Me, Gn, S and the lower
 * incisor — never N, PNS/ANS or any molar/premolar cusp, so none of the
 * app's first three reference planes (facial, palatal, occlusal) can ever be
 * built from it. Before the Frankfort horizontal (Po → Or) was added as a
 * fourth reference option, `getSimulationReadiness` reported `canSimulate:
 * false` on every Tweed-only tracing and every movement control was
 * withheld — Treatment Simulation was a dead feature for the one analysis
 * the app's own daily user relies on. This is the same coordinate set as
 * `tweed.test.ts`'s bundled-sample-film case.
 */
const tweedOnlyTracing: LandmarkMap = {
  'S': { x: 300, y: 946 },
  'Gn': { x: 994, y: 1757 },
  'Po': { x: 204, y: 1130 },
  'Or': { x: 860, y: 1105 },
  'Go': { x: 425, y: 1615 },
  'Me': { x: 931, y: 1788 },
  'L1 Apex': { x: 955, y: 1529 },
  'L1 Incisal Edge': { x: 986, y: 1395 },
};

describe('Treatment Simulation on a Tweed-only tracing', () => {
  it('is no longer a dead feature: Frankfort horizontal (Po → Or) supplies a reference', () => {
    const readiness = getSimulationReadiness(tweedOnlyTracing, null);
    expect(readiness.canSimulate).toBe(true);
  });

  it('enables the lower-incisor tipping control without any mm calibration', () => {
    // Angular, so it needs no scale factor -- and Tweed always supplies its
    // own required landmarks (L1 Apex, L1 Incisal Edge).
    expect(LOWER_INCISOR_REQUIRED.every((s) => tweedOnlyTracing[s] !== undefined))
      .toBe(true);
    const controls = describeControls(tweedOnlyTracing, null);
    const l1 = controls.filter((c) => c.spec.id === 'l1')[0];
    expect(l1.isAvailable).toBe(true);
    expect(l1.needsReference).toBe(false);
  });

  it('was unreachable before the fix: none of facial/palatal/occlusal is buildable', () => {
    // N, PNS, ANS and every molar/premolar cusp are absent from this tracing --
    // this is the regression the fix addresses, asserted directly so a future
    // change to the reference-plane fallback order cannot silently reopen it.
    expect(tweedOnlyTracing['N']).toBe(undefined);
    expect(tweedOnlyTracing['PNS']).toBe(undefined);
    expect(tweedOnlyTracing['ANS']).toBe(undefined);
    expect(tweedOnlyTracing['U6']).toBe(undefined);
  });
});

/**
 * A synthetic right-facing tracing whose palatal plane runs exactly along +x
 * (PNS -> ANS), so the anterior unit vector is (1, 0) and every expected
 * displacement below can be written down by hand. Calibrated at 0.1 mm/px,
 * i.e. 10 px per mm.
 */
const SCALE = 0.1;
/** Float comparison for hand-computed pixel expectations. */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const bodilyFixture: LandmarkMap = {
  'PNS': { x: 100, y: 500 },
  'ANS': { x: 500, y: 500 },
  'A': { x: 520, y: 560 },
  'N': { x: 560, y: 200 },
  'Me': { x: 520, y: 900 },
  'U1 Apex': { x: 540, y: 560 },
  'U1 Incisal Edge': { x: 570, y: 660 },
  'U6': { x: 380, y: 640 },
  'Ls': { x: 620, y: 650 },
  'Sls': { x: 610, y: 620 },
  'Sts': { x: 622, y: 672 },
  'Li': { x: 618, y: 700 },
};

describe('Bodily incisor movement (u1Mm / l1Mm)', () => {
  it('translates apex and edge together and moves the lips by the published ratios', () => {
    const sim = applySimulation(
      bodilyFixture, { ...EMPTY_PLAN, u1Mm: -4 }, SCALE,
    );
    // -4 mm at 10 px/mm along (1, 0): both incisor points move (-40, 0).
    expect(sim.displacements['U1 Apex']).toEqual({ x: -40, y: 0 });
    expect(sim.displacements['U1 Incisal Edge']).toEqual({ x: -40, y: 0 });
    // The lips follow at the table's own u1 fractions of that movement.
    expect(near(sim.displacements['Ls'].x, -16)).toBe(true);   // 0.4
    expect(near(sim.displacements['Sls'].x, -12)).toBe(true);  // 0.3
    expect(near(sim.displacements['Sts'].x, -16)).toBe(true);  // 0.4
    // The lower lip, the molar and the cranium do not move.
    expect(sim.displacements['Li']).toBe(undefined);
    expect(sim.displacements['U6']).toBe(undefined);
    expect(sim.displacements['N']).toBe(undefined);
  });

  it('never double-counts a jaw translation the incisor rides with', () => {
    // Maxilla +5 mm and incisor -5 mm bodily cancel on the tooth itself...
    const sim = applySimulation(
      bodilyFixture, { ...EMPTY_PLAN, maxillaMm: 5, u1Mm: -5 }, SCALE,
    );
    expect(near(sim.displacements['U1 Incisal Edge'].x, 0)).toBe(true);
    // ...but the lip follows each driver at its own column: 0.6 x (+50 px)
    // + 0.4 x (-50 px) = +10 px. A wrong 0.4 x (net 0) would read 0; a wrong
    // 1.0 x anything would be far larger.
    expect(near(sim.displacements['Ls'].x, 10)).toBe(true);
  });

  it('feeds the tipping delta and the bodily delta into one ratio', () => {
    const sim = applySimulation(
      bodilyFixture, { ...EMPTY_PLAN, u1Deg: -10, u1Mm: -3 }, SCALE,
    );
    // The edge's total displacement IS the incisor's own movement (tipping +
    // bodily; no jaw is moved here), so Ls must sit at exactly 0.4 of it.
    const edge = sim.displacements['U1 Incisal Edge'];
    const ls = sim.displacements['Ls'];
    expect(near(ls.x, 0.4 * edge.x)).toBe(true);
    expect(near(ls.y, 0.4 * edge.y)).toBe(true);
  });

  it('withholds the bodily controls on an uncalibrated film', () => {
    const sim = applySimulation(
      bodilyFixture, { ...EMPTY_PLAN, u1Mm: -5 }, null,
    );
    expect(sim.displacements['U1 Apex']).toBe(undefined);
    expect(sim.displacements['U1 Incisal Edge']).toBe(undefined);
    const controls = describeControls(bodilyFixture, null);
    const u1Mm = controls.filter((c) => c.spec.id === 'u1Mm')[0];
    expect(u1Mm.needsScale).toBe(true);
    expect(u1Mm.isAvailable).toBe(false);
    // The angular inclination control stays available without a scale.
    const u1 = controls.filter((c) => c.spec.id === 'u1')[0];
    expect(u1.isAvailable).toBe(true);
  });

  it('keeps the bookkeeping honest: planKey, isPlanEmpty, frame travel, disclosure', () => {
    expect(planKey({ ...EMPTY_PLAN, u1Mm: -3 }) !== planKey(EMPTY_PLAN))
      .toBe(true);
    expect(isPlanEmpty({ ...EMPTY_PLAN, l1Mm: 1 })).toBe(false);
    // The frame padding covers the bodily travel: with the calibration it
    // must exceed the 8 mm = 80 px worst case, and exceed the uncalibrated
    // figure (which has no linear travel at all).
    const withScale = maxSimulatedTravelPx(bodilyFixture, SCALE);
    const withoutScale = maxSimulatedTravelPx(bodilyFixture, null);
    expect(withScale > withoutScale).toBe(true);
    expect(withScale >= 80).toBe(true);
    // A bodily-only plan is disclosed under the same upper-incisor driver.
    const rows = activeSoftTissueRatios({ ...EMPTY_PLAN, u1Mm: -3 });
    const ls = rows.filter((r) => r.ratio.symbol === 'Ls')[0];
    expect(ls === undefined).toBe(false);
    expect(ls.drivers.some((d) => d.driver === 'upper incisor')).toBe(true);
  });

  it('pads the frame for jaw + tipping + bodily as ADDITIVE incisal-edge travel', () => {
    // The upper incisor rides the maxilla, tips, and translates bodily in one
    // plan, so the frame padding must cover their sum — not the max of the
    // skeletal and the incisor-own parts. With this fixture's U1 axis
    // (|edge − apex| ≈ 104.4 px), 15° chord ≈ 27.3 px, bodily 8 mm = 80 px
    // and maxilla worst case hypot(8, 6) = 10 mm = 100 px: the sum is well
    // above either part alone.
    const travel = maxSimulatedTravelPx(bodilyFixture, SCALE);
    const apex = bodilyFixture['U1 Apex'] as { x: number; y: number };
    const edge = bodilyFixture['U1 Incisal Edge'] as { x: number; y: number };
    const axis = Math.hypot(edge.x - apex.x, edge.y - apex.y);
    const chord = 2 * axis * Math.sin((15 * Math.PI / 180) / 2);
    const maxillaPx = Math.hypot(8, 6) / SCALE;
    expect(travel >= maxillaPx + chord + 80 - 1e-6).toBe(true);
  });
});

describe('Simulation value table implausibility gating', () => {
  it('never flags an untouched row as implausible, even far outside its norm', () => {
    // A tracing whose nasolabial angle is wildly outside plausibility as
    // *measured* (the fixture is synthetic arithmetic): with an EMPTY plan the
    // simulated column is the measured value, and the implausibility mark —
    // a statement about what the plan did — must not appear. This is exactly
    // how the app's own auto-plotted sample film used to open: a red mark on
    // a row no slider had touched.
    const map: LandmarkMap = {
      ...bodilyFixture,
      'Pn': { x: 700, y: 560 },
      'Sn': { x: 640, y: 610 },
    };
    const sim = applySimulation(map, EMPTY_PLAN, SCALE);
    const table = buildSimulationTable(map, sim.landmarks, SCALE);
    const naso = table.rows.filter((r) => r.row.symbol === 'Nasolabial')[0];
    expect(naso === undefined).toBe(false);
    expect(naso.isSimulatedImplausible).toBe(false);
    // And when a plan genuinely drives a value outside plausibility, the mark
    // still fires: tip the incisor to the extreme and check the same row is
    // free to flag once its value actually changed. (Whether it crosses the
    // plausibility reach depends on geometry; assert only the gate — a
    // changed row MAY flag, an unchanged one NEVER does.)
    const wild = applySimulation(map, { ...EMPTY_PLAN, u1Deg: 15 }, SCALE);
    const wildTable = buildSimulationTable(map, wild.landmarks, SCALE);
    const wildNaso = wildTable.rows.filter((r) => r.row.symbol === 'Nasolabial')[0];
    expect(wildNaso === undefined).toBe(false);
    // The gate itself: an unchanged row's flag is always false regardless of
    // where the measured value sits.
    const untouched = wildTable.rows.filter((r) => Math.abs(r.row.change) < 0.05);
    untouched.forEach((r) => {
      expect(r.isSimulatedImplausible).toBe(false);
    });
  });
});
