import expect from 'expect';

import dental from './dental';
import {
  overjet, overbite,
} from 'analyses/landmarks/distances/dental';
import {
  upperIncisorToNA, lowerIncisorToNB,
  maxillaryIncisorToDentalPlane, mandibularIncisorToDentalPlane,
} from 'analyses/landmarks/distances/skeletal';

/**
 * dental.ts's own module comment documents a shipped bug this guards against:
 * overjet and overbite used to carry a fabricated mean ± SD (`mean: 2.5,
 * min: 1.5, max: 3.5` and similar) for a figure that is a conventional
 * clinical *ideal*, not a measured population's standard deviation -- so an
 * ordinary reading a millimetre either side of ideal picked up manufactured
 * stars. `RANGE` (band: 'range') is the fix; this asserts it stays that way,
 * and that the four incisor-position readings -- genuine published SD norms
 * (Steiner, Downs, Ricketts, cited in the module) -- are NOT declared as
 * ranges, since that would be the opposite error: a real standard deviation
 * silently downgraded to an unstarred band.
 */
describe('Dental', () => {
  it('declares overjet and overbite as clinical-ideal ranges, never a fabricated SD', () => {
    dental.components.forEach(({ landmark: { symbol }, band }) => {
      if (symbol === overjet.symbol || symbol === overbite.symbol) {
        expect(band).toBe('range');
      }
    });
  });

  it('declares the four incisor-position readings as real SD norms, not ranges', () => {
    const sdSymbols = [
      upperIncisorToNA.symbol, lowerIncisorToNB.symbol,
      maxillaryIncisorToDentalPlane.symbol, mandibularIncisorToDentalPlane.symbol,
    ];
    dental.components.forEach(({ landmark: { symbol }, band }) => {
      if (sdSymbols.indexOf(symbol) !== -1) {
        expect(band).toNotBe('range');
      }
    });
  });

  it('borrows the interincisal angle and IMPA at the same figures their own analyses publish', () => {
    // The module comment names a historical divergence: this analysis once
    // printed 130 ± 5 for the interincisal angle while steiner.ts printed
    // 131 ± 10 for the identical measurement, and 90 ± 3 for IMPA against
    // tweed.ts's 90 ± 5. Both must be borrowed whole, not re-rounded.
    const bySymbol: { [symbol: string]: typeof dental.components[0] } = {};
    dental.components.forEach((c) => { bySymbol[c.landmark.symbol] = c; });
    const interincisal = bySymbol['U1-L1'];
    expect(interincisal).toExist();
    expect(interincisal.mean).toBe(131);
    expect(interincisal.min).toBe(121);
    expect(interincisal.max).toBe(141);
    const impa = bySymbol['IMPA'];
    expect(impa).toExist();
    expect(impa.mean).toBe(90);
    expect(impa.min).toBe(85);
    expect(impa.max).toBe(95);
  });
});
