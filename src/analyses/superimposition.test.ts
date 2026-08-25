import expect from 'expect';

import { buildRegistration, getBasis } from './superimposition';

/**
 * `buildRegistration`'s `translationPx` is shown to the clinician as
 * "registration point moved N mm" -- the one sanity check for "did I
 * mis-plot the registration landmark on one of the two films" (see
 * Superimposition/index.tsx's `formatDisplacement`). T1 and T2 are traced on
 * two independent images, each in its own raw pixel grid, so a naive
 * `hypot(O1 - O2)` mixes two different pixels-per-mm ratios whenever the
 * films carry different calibrations -- exactly the case (a longitudinal
 * series photographed on different equipment) this feature exists for.
 */
describe('buildRegistration', () => {
  const basis = getBasis('mandibular'); // origin: Me, from: Go, to: Me

  it('reads a physically identical point as exact, even when T1 and T2 have different resolutions', () => {
    // T1: 0.1 mm/px. T2: the same physical anatomy, digitised at twice the
    // pixel density (0.05 mm/px) -- so every T2 coordinate is exactly double
    // its T1 counterpart, and a correct fit should read as no displacement
    // at all once that resolution difference is accounted for.
    const t1 = {
      'Me': { x: 1000, y: 1000 },
      'Go': { x: 700, y: 900 },
    };
    const t2 = {
      'Me': { x: 2000, y: 2000 },
      'Go': { x: 1400, y: 1800 },
    };
    const registration = buildRegistration(basis, t1, t2, 0.1, 0.05);
    expect(registration.isAvailable).toBe(true);
    // Scale-corrected, the two Me points coincide exactly.
    expect(registration.translationPx).toBeLessThan(1e-6);
  });

  it('still reports a genuine mismatch after correcting for resolution', () => {
    const t1 = {
      'Me': { x: 1000, y: 1000 },
      'Go': { x: 700, y: 900 },
    };
    const t2 = {
      // Me shifted by (40, 0) T2 px beyond the pure resolution difference.
      'Me': { x: 2040, y: 2000 },
      'Go': { x: 1400, y: 1800 },
    };
    const registration = buildRegistration(basis, t1, t2, 0.1, 0.05);
    // 40 T2 px * (sf2/sf1 = 0.5) = 20 T1-equivalent px of real mismatch.
    expect(Math.abs(registration.translationPx - 20)).toBeLessThan(1e-6);
  });

  it('falls back to the raw pixel distance when either film is uncalibrated (unchanged behaviour)', () => {
    const t1 = {
      'Me': { x: 1000, y: 1000 },
      'Go': { x: 700, y: 900 },
    };
    const t2 = {
      'Me': { x: 1005, y: 1000 },
      'Go': { x: 705, y: 900 },
    };
    const registration = buildRegistration(basis, t1, t2, null, null);
    expect(registration.isMagnificationAssumed).toBe(true);
    expect(Math.abs(registration.translationPx - 5)).toBeLessThan(1e-6);
  });
});
