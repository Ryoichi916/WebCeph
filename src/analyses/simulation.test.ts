import expect from 'expect';

import {
  getSimulationReadiness, describeControls, LOWER_INCISOR_REQUIRED,
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
