import { LandmarkPredictor, PredictedLandmark, PredictionInput } from './types';
import demoPredictor from './demo';
import onnxPredictor from './onnx';

export type { LandmarkPredictor, PredictedLandmark, PredictionInput } from './types';

/**
 * Switch to the onnxruntime-web backend once a trained model is available at the
 * configured MODEL_URL (see predictors/onnx.ts). Until then the demo predictor
 * is used so the feature works end-to-end.
 */
const USE_ONNX = false;

export const getActivePredictor = (): LandmarkPredictor =>
  USE_ONNX ? onnxPredictor : demoPredictor;

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
