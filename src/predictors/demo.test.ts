import expect from 'expect';

import demoPredictor from './demo';
import { predictionsToLandmarks } from './index';
import { PredictionInput } from './types';

const makeInput = (symbols: string[], width = 1000, height = 800): PredictionInput => ({
  // The demo predictor ignores pixels; a 1x1 placeholder keeps the type honest.
  imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData,
  width,
  height,
  symbols,
});

describe('demo predictor', () => {
  it('returns exactly one prediction per requested symbol', async () => {
    const symbols = ['N', 'S', 'A', 'B', 'Or'];
    const results = await demoPredictor.predict(makeInput(symbols));
    expect(results.length).toEqual(symbols.length);
    expect(results.map(r => r.symbol).sort()).toEqual(symbols.slice().sort());
  });

  it('keeps every point within the image bounds', async () => {
    const width = 1234;
    const height = 567;
    const results = await demoPredictor.predict(makeInput(['N', 'S', 'Gn'], width, height));
    results.forEach(({ x, y }) => {
      expect(x >= 0 && x <= width).toBe(true);
      expect(y >= 0 && y <= height).toBe(true);
    });
  });

  it('is deterministic across runs', async () => {
    const a = await demoPredictor.predict(makeInput(['N', 'S', 'A']));
    const b = await demoPredictor.predict(makeInput(['N', 'S', 'A']));
    expect(a).toEqual(b);
  });

  it('maps distinct symbols to distinct positions', async () => {
    const results = await demoPredictor.predict(makeInput(['N', 'S', 'A', 'B']));
    const keys = results.map(({ x, y }) => `${x},${y}`);
    expect(new Set(keys).size).toEqual(results.length);
  });
});

describe('predictionsToLandmarks', () => {
  const predictions = [
    { symbol: 'N', x: 10.4, y: 20.6 },
    { symbol: 'S', x: -5, y: 9000 },
  ];

  it('rounds and clamps to the image bounds', () => {
    const landmarks = predictionsToLandmarks(predictions, 100, 100, {}, false);
    expect(landmarks['N']).toEqual({ x: 10, y: 21 });
    expect(landmarks['S']).toEqual({ x: 0, y: 100 });
  });

  it('skips already-placed symbols when overwrite is false', () => {
    const placed = { N: { x: 1, y: 1 } };
    const landmarks = predictionsToLandmarks(predictions, 100, 100, placed, false);
    expect(landmarks['N']).toBe(undefined);
    expect(landmarks['S']).toBeTruthy();
  });

  it('overwrites already-placed symbols when overwrite is true', () => {
    const placed = { N: { x: 1, y: 1 } };
    const landmarks = predictionsToLandmarks(predictions, 100, 100, placed, true);
    expect(landmarks['N']).toEqual({ x: 10, y: 21 });
  });
});
