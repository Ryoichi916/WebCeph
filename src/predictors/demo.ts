import { LandmarkPredictor, PredictionInput, PredictedLandmark } from './types';

/** Stable FNV-1a hash so each symbol maps to the same spot across runs. */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const frac = (n: number): number => n - Math.floor(n);

/**
 * A deterministic, dependency-free placeholder predictor. It spreads one point
 * per requested symbol across the central region of the image so the auto-plot
 * pipeline is demonstrable and testable without a trained model. Replace via
 * `getActivePredictor` with a real (e.g. onnxruntime-web) backend.
 */
const demoPredictor: LandmarkPredictor = {
  id: 'demo-heuristic',
  isReady: () => true,
  predict: ({ width, height, symbols }: PredictionInput): Promise<PredictedLandmark[]> => {
    const results: PredictedLandmark[] = symbols.map((symbol) => {
      const h = hash(symbol);
      const fx = 0.2 + 0.6 * frac(h / 9973);
      const fy = 0.2 + 0.6 * frac((h / 9941) * 1.6180339887);
      return { symbol, x: width * fx, y: height * fy };
    });
    return Promise.resolve(results);
  },
};

export default demoPredictor;
