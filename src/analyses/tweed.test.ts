import expect from 'expect';

import tweed from './tweed';
import {
  getStepsForAnalysis, mapAndCalculateSteps, indexAnalysisResults,
} from 'analyses/helpers';

/**
 * The closure identity of Tweed's diagnostic triangle: FMA + IMPA + FMIA must
 * total 180° at **every** tracing state, because the three angles are computed
 * from the same three directed lines (see `tweed.ts`). These tests run the
 * real landmark pipeline — points → lines → angles, exactly as the store does —
 * over tracings that differ in the ways patients do, and assert the identity
 * to far below the 0.1° the app displays.
 */

type Landmarks = Record<string, GeoObject>;

const evaluate = (manualLandmarks: Landmarks) => {
  const steps = getStepsForAnalysis(tweed, false);
  return mapAndCalculateSteps(steps, manualLandmarks);
};

const expectClosure = (values: Record<string, number | undefined>) => {
  const FMA = values['FMPA'];
  const IMPA = values['IMPA'];
  const FMIA = values['FMIA'];
  const sum = values['FMPA+IMPA+FMIA'];
  expect(typeof FMA).toBe('number');
  expect(typeof IMPA).toBe('number');
  expect(typeof FMIA).toBe('number');
  expect(typeof sum).toBe('number');
  expect(Math.abs((FMA! + IMPA! + FMIA!) - 180)).toBeLessThan(1e-9);
  expect(Math.abs(sum! - 180)).toBeLessThan(1e-9);
};

/**
 * The bundled sample film's own tracing — the demo Auto-plot template
 * (`predictors/demo.ts`) at the film's native 1578×2089. A child in mixed
 * dentition with a retroclined lower incisor, so the expected readings below
 * are the film's anatomy, not round numbers.
 */
const W = 1578;
const H = 2089;
const at = (fx: number, fy: number): GeoPoint => ({ x: fx * W, y: fy * H });

const sampleFilm: Landmarks = {
  'S': at(0.190, 0.452),
  'Gn': at(0.630, 0.841),
  'Po': at(0.129, 0.541),
  'Or': at(0.545, 0.529),
  'Go': at(0.269, 0.773),
  'Me': at(0.590, 0.856),
  'L1 Apex': at(0.605, 0.732),
  'L1 Incisal Edge': at(0.625, 0.668),
};

describe('Tweed diagnostic triangle', () => {
  describe('on the bundled sample film (demo tracing)', () => {
    const { values, objects } = evaluate(sampleFilm);

    it('closes to exactly 180°', () => {
      expectClosure(values);
    });

    it('reads the film\'s anatomy (FMA ~21°, IMPA retroclined ~84°)', () => {
      expect(Math.abs(values['FMPA']! - 21.1)).toBeLessThan(0.2);
      expect(Math.abs(values['IMPA']! - 84.4)).toBeLessThan(0.2);
      expect(Math.abs(values['FMIA']! - 74.5)).toBeLessThan(0.2);
    });

    it('presents the triangle as one leading group, closure row included', () => {
      const results = tweed.interpret(values, objects);
      expect(results[0].category).toBe('tweedTriangle');
      expect(
        results[0].relevantComponents.map(({ symbol }) => symbol),
      ).toEqual(['FMPA', 'IMPA', 'FMIA', 'FMPA+IMPA+FMIA']);
      // FMA 21.1° and IMPA 84.4° both fall below their bands.
      expect(results[0].indication).toBe('outside_norm');

      // The per-angle conclusions survive as their own findings, drawn from
      // the same measurements (the shared table layout renders them as named
      // conclusions on the triangle's group).
      const indexed = indexAnalysisResults(results);
      expect(indexed['mandibularRotation']!.indication)
        .toBe('counterclockwise');
      expect(indexed['lowerIncisorInclination']!.indication).toBe('lingual');
      expect(indexed['growthPattern']).toExist();
      // The closure row is tabulated once, inside the triangle.
      expect(indexed['measurement']).toNotExist();
    });
  });

  // Synthetic tracings across the clinical range. Coordinates are in image
  // space (y grows downward, patient facing right), built so the mandibular
  // plane descends anteriorly and the incisor tilts as described.
  const syntheticCases: { [name: string]: Landmarks } = {
    'steep mandibular plane, proclined incisor': {
      'S': { x: 300, y: 500 }, 'Gn': { x: 950, y: 1450 },
      'Po': { x: 200, y: 600 }, 'Or': { x: 900, y: 580 },
      'Go': { x: 350, y: 1100 }, 'Me': { x: 940, y: 1480 },
      'L1 Apex': { x: 860, y: 1300 }, 'L1 Incisal Edge': { x: 960, y: 1080 },
    },
    'flat mandibular plane, upright incisor': {
      'S': { x: 300, y: 500 }, 'Gn': { x: 980, y: 1350 },
      'Po': { x: 200, y: 600 }, 'Or': { x: 900, y: 590 },
      'Go': { x: 340, y: 1250 }, 'Me': { x: 970, y: 1370 },
      'L1 Apex': { x: 880, y: 1250 }, 'L1 Incisal Edge': { x: 900, y: 1020 },
    },
    'severely retroclined incisor': {
      'S': { x: 300, y: 500 }, 'Gn': { x: 950, y: 1400 },
      'Po': { x: 200, y: 600 }, 'Or': { x: 900, y: 585 },
      'Go': { x: 350, y: 1150 }, 'Me': { x: 950, y: 1430 },
      'L1 Apex': { x: 900, y: 1280 }, 'L1 Incisal Edge': { x: 840, y: 1060 },
    },
  };

  Object.keys(syntheticCases).forEach((name) => {
    it(`closes to exactly 180° with a ${name}`, () => {
      const { values } = evaluate(syntheticCases[name]);
      expectClosure(values);
    });
  });

  it('falls back to the default grouping while nothing is computed', () => {
    const { values, objects } = evaluate({});
    expect(tweed.interpret(values, objects)).toEqual([]);
  });
});
