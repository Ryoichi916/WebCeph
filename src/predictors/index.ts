import { LandmarkPredictor, PredictedLandmark, PredictionInput } from './types';
import demoPredictor from './demo';

export type { LandmarkPredictor, PredictedLandmark, PredictionInput } from './types';

/**
 * The active landmark predictor. Today this is the deterministic demo
 * predictor; swapping in a trained onnxruntime-web backend is a one-line change
 * here once a model is available (see predictors/onnx.ts).
 */
export const getActivePredictor = (): LandmarkPredictor => demoPredictor;

export function runPrediction(input: PredictionInput): Promise<PredictedLandmark[]> {
  return getActivePredictor().predict(input);
}

const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

/**
 * Convert raw predictions into the manual-landmark batch payload: rounded and
 * clamped to the image bounds, keyed by symbol. When `overwrite` is false,
 * symbols that already have a manually placed landmark are skipped.
 */
export function predictionsToLandmarks(
  predictions: PredictedLandmark[],
  width: number,
  height: number,
  placed: { [symbol: string]: GeoObject },
  overwrite: boolean,
): { [symbol: string]: GeoObject } {
  const landmarks: { [symbol: string]: GeoObject } = {};
  predictions.forEach(({ symbol, x, y }) => {
    if (!overwrite && placed[symbol] !== undefined) {
      return;
    }
    landmarks[symbol] = {
      x: clamp(Math.round(x), 0, width),
      y: clamp(Math.round(y), 0, height),
    };
  });
  return landmarks;
}
