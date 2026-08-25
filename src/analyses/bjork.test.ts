import expect from 'expect';

import bjork from './bjork';
import { NSAr, SArGo, ArGoMe } from 'analyses/landmarks/angles/skeletal';
import { bjorkSum, articulareCaveats } from 'analyses/landmarks/other/skeletal';
import { getStepsForAnalysis, mapAndCalculateSteps } from 'analyses/helpers';

/**
 * `articulareCaveats` (analyses/landmarks/other/skeletal.ts) leans on
 * Björk's sum being the arithmetic total of the saddle, articular and gonial
 * angles it is built from — a displaced articulare only reads as the caveat's
 * trigger pattern (opposite-signed deviations bigger than the total's) when
 * that stays true. Unlike Tweed's triangle, which carries a dedicated
 * closure-test suite, this had no regression test at all.
 */
type Landmarks = Record<string, GeoObject>;

const evaluate = (manualLandmarks: Landmarks) => {
  const steps = getStepsForAnalysis(bjork, false);
  return mapAndCalculateSteps(steps, manualLandmarks);
};

describe('Björk', () => {
  it("the sum equals the arithmetic total of the three angles it is built from", () => {
    const { values } = evaluate({
      'N': { x: 300, y: 400 },
      'S': { x: 500, y: 420 },
      'Ar': { x: 560, y: 560 },
      'Go': { x: 620, y: 900 },
      'Me': { x: 720, y: 1150 },
    });
    const saddle = values[NSAr.symbol];
    const articular = values[SArGo.symbol];
    const gonial = values[ArGoMe.symbol];
    const sum = values[bjorkSum.symbol];
    expect(typeof saddle).toBe('number');
    expect(typeof articular).toBe('number');
    expect(typeof gonial).toBe('number');
    expect(typeof sum).toBe('number');
    expect(Math.abs((saddle! + articular! + gonial!) - sum!)).toBeLessThan(1e-9);
  });

  describe('the articulare caveat', () => {
    // articulareCaveats takes a plain values map, so its trigger logic is
    // testable directly against the exact pattern it looks for -- no
    // geometry needed.
    it('fires when saddle and articular deviate in opposite directions by ' +
      'more than the total does', () => {
      const caveats = articulareCaveats({
        [NSAr.symbol]: 115.2, // -1.6 SD
        [SArGo.symbol]: 133.6, // -1.6 SD
        [ArGoMe.symbol]: 139.0, // +1.3 SD
        [bjorkSum.symbol]: 387.8, // -1.4 SD, nearer its mean than any part
      });
      expect(caveats.length).toBe(1);
      expect(caveats[0].symbols).toEqual([NSAr.symbol, SArGo.symbol, ArGoMe.symbol]);
    });

    it('does not fire on an ordinary tracing where the parts and the sum agree', () => {
      const caveats = articulareCaveats({
        [NSAr.symbol]: 123,
        [SArGo.symbol]: 143,
        [ArGoMe.symbol]: 130,
        [bjorkSum.symbol]: 396,
      });
      expect(caveats).toEqual([]);
    });

    it('does not fire when a needed angle is missing', () => {
      expect(articulareCaveats({ [NSAr.symbol]: 115.2 })).toEqual([]);
    });
  });
});
