import type * as ORT from 'onnxruntime-web';
import { LandmarkPredictor, PredictionInput, PredictedLandmark } from './types';

/**
 * onnxruntime-web backend for cephalometric landmark detection.
 *
 * NOTE: no trained model ships with WebCeph, so this backend is opt-in (see
 * USE_ONNX in predictors/index.ts) and inert by default. To enable it, place an
 * ONNX model at MODEL_URL and fill in LANDMARK_ORDER to match the model's
 * output. The model contract assumed here:
 *   - input:  1 x 1 x SIZE x SIZE  float32, grayscale, normalised to [0, 1]
 *   - output: a flat float32 buffer of [x0, y0, x1, y1, ...] landmark
 *             coordinates normalised to [0, 1] of the input image.
 * A model with a different input/output shape only needs the pre/post-process
 * helpers below adjusted; the rest of the pipeline is unchanged.
 */

const MODEL_URL = '/models/cephalometric.onnx';
const SIZE = 256;

/** Maps a model output index to a WebCeph landmark symbol. Fill per model. */
const LANDMARK_ORDER: string[] = [];

// onnxruntime-web is loaded lazily so it (and its WASM) is a separate chunk that
// is only fetched when ONNX inference actually runs.
let ortPromise: Promise<typeof ORT> | null = null;
const getOrt = (): Promise<typeof ORT> => {
  if (ortPromise === null) {
    ortPromise = import('onnxruntime-web');
  }
  return ortPromise;
};

let sessionPromise: Promise<ORT.InferenceSession> | null = null;
let ready = false;

const getSession = (): Promise<ORT.InferenceSession> => {
  if (sessionPromise === null) {
    sessionPromise = (async () => {
      const ort = await getOrt();
      const session = await ort.InferenceSession.create(MODEL_URL);
      ready = true;
      return session;
    })();
  }
  return sessionPromise;
};

/** ImageData -> grayscale, SIZE x SIZE, normalised float32 (nearest-neighbour). */
const preprocess = (imageData: ImageData): Float32Array => {
  const { data, width, height } = imageData;
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / SIZE));
    for (let x = 0; x < SIZE; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / SIZE));
      const i = (sy * width + sx) * 4;
      const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      out[y * SIZE + x] = gray;
    }
  }
  return out;
};

const onnxPredictor: LandmarkPredictor = {
  id: 'onnx',
  isReady: () => ready,
  predict: async ({ imageData, width, height, symbols }: PredictionInput): Promise<PredictedLandmark[]> => {
    const ort = await getOrt();
    const session = await getSession();

    const tensor = new ort.Tensor('float32', preprocess(imageData), [1, 1, SIZE, SIZE]);
    const feeds: Record<string, ORT.Tensor> = { [session.inputNames[0]]: tensor };
    const output = await session.run(feeds);
    const coords = output[session.outputNames[0]].data as Float32Array;

    const requested = new Set(symbols);
    const results: PredictedLandmark[] = [];
    for (let i = 0; i < LANDMARK_ORDER.length; i++) {
      const symbol = LANDMARK_ORDER[i];
      if (!requested.has(symbol)) {
        continue;
      }
      // Output coordinates are normalised to [0, 1] of the original image.
      results.push({
        symbol,
        x: coords[i * 2] * width,
        y: coords[i * 2 + 1] * height,
      });
    }
    return results;
  },
};

export default onnxPredictor;
