import expect from 'expect';

import jarabak from './jarabak';
import {
  posteriorAnteriorFacialHeightRatio,
  upperAnteriorFaceHeightShare,
  anteriorFacialHeight,
  posteriorFacialHeight,
  upperAnteriorFacialHeight,
} from 'analyses/landmarks/distances/skeletal';
import { getStepsForAnalysis, mapAndCalculateSteps } from 'analyses/helpers';

/**
 * Jarabak's two graded proportions (S-Go/N-Me and N-ANS/N-Me, both `RANGE`,
 * see jarabak.ts) are read directly off the four absolute lengths this
 * module also tabulates -- the module's own doc comment promises "each ratio
 * can be checked against the two lengths it is made of". This test is that
 * check, run on the app's own numbers, so a future change to either formula
 * cannot silently disagree with the other the way the historical bugs this
 * file's doc comments describe (a fabricated SD, a length that never reached
 * the table) went unnoticed.
 */
type Landmarks = Record<string, GeoObject>;

const evaluate = (manualLandmarks: Landmarks) => {
  const steps = getStepsForAnalysis(jarabak, false);
  return mapAndCalculateSteps(steps, manualLandmarks);
};

describe('Jarabak', () => {
  const tracing: Landmarks = {
    'N': { x: 300, y: 400 },
    'S': { x: 500, y: 420 },
    'Ar': { x: 560, y: 560 },
    'Go': { x: 620, y: 900 },
    'Me': { x: 720, y: 1150 },
    'ANS': { x: 640, y: 700 },
  };
  const { values } = evaluate(tracing);

  it('reports the posterior/anterior facial-height ratio consistent with the two lengths it is built from', () => {
    const ratio = values[posteriorAnteriorFacialHeightRatio.symbol];
    const posterior = values[posteriorFacialHeight.symbol];
    const anterior = values[anteriorFacialHeight.symbol];
    expect(typeof ratio).toBe('number');
    expect(typeof posterior).toBe('number');
    expect(typeof anterior).toBe('number');
    expect(Math.abs(ratio! - (100 * posterior! / anterior!))).toBeLessThan(1e-6);
  });

  it('reports the upper anterior face-height share consistent with N-ANS and N-Me', () => {
    const share = values[upperAnteriorFaceHeightShare.symbol];
    const upper = values[upperAnteriorFacialHeight.symbol];
    const anterior = values[anteriorFacialHeight.symbol];
    expect(typeof share).toBe('number');
    expect(typeof upper).toBe('number');
    expect(typeof anterior).toBe('number');
    expect(Math.abs(share! - (100 * upper! / anterior!))).toBeLessThan(1e-6);
  });

  it('declares both proportions as published ranges, not fabricated SD bands', () => {
    jarabak.components.forEach(({ landmark: { symbol }, band }) => {
      if (
        symbol === posteriorAnteriorFacialHeightRatio.symbol ||
        symbol === upperAnteriorFaceHeightShare.symbol
      ) {
        expect(band).toBe('range');
      }
    });
  });

  it('states no norm for the four absolute lengths, which are age- and sex-specific', () => {
    const lengthSymbols = [
      'S-N (mm)', 'S-Ar (mm)', 'Ar-Go (mm)', 'Go-Me (mm)',
      anteriorFacialHeight.symbol, posteriorFacialHeight.symbol,
      upperAnteriorFacialHeight.symbol,
    ];
    jarabak.components.forEach(({ landmark: { symbol }, mean }) => {
      if (lengthSymbols.indexOf(symbol) !== -1) {
        expect(isNaN(mean)).toBe(true);
      }
    });
  });
});
