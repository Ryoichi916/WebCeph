import type * as ORT from 'onnxruntime-web';
import { LandmarkPredictor, PredictionInput, PredictedLandmark } from './types';

/**
 * onnxruntime-web backend for cephalometric landmark detection.
 *
 * Designed around a heatmap-regression model such as the MIT-licensed HRNet
 * cephalometric model (cwlachap/hrnet-cephalometric-landmark-detection, 19
 * lateral landmarks). No model ships with WebCeph; this backend is opt-in (see
 * USE_ONNX in predictors/index.ts). To enable it:
 *
 *   1. Convert the model to ONNX (see tools/convert_hrnet_to_onnx.py) and place
 *      it at MODEL_URL.
 *   2. Make the CONFIG below match the model's training preprocessing and the
 *      LANDMARK_ORDER match the model's output channel order.
 *   3. Set USE_ONNX = true in predictors/index.ts.
 *
 * The model contract assumed here (HRNet defaults):
 *   - input:  1 x C x SIZE x SIZE float32 (C = INPUT_CHANNELS), normalised
 *   - output: 1 x N x Hh x Wh float32 heatmaps (one channel per landmark); the
 *             peak of each channel is the landmark location.
 * For a model that outputs coordinates directly instead of heatmaps, set
 * OUTPUT_IS_HEATMAP = false (output is then read as normalised [x, y] pairs).
 */

// ---- Model configuration (match these to your converted model) -------------
const MODEL_URL = '/models/cephalometric.onnx';
const SIZE = 256;
const INPUT_CHANNELS: number = 3;
const OUTPUT_IS_HEATMAP: boolean = true;
// Per-channel normalisation (ImageNet defaults, common for HRNet-W32 backbones).
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Maps each model output channel (index) to a WebCeph landmark symbol. Order
 * follows the standard ISBI-2015 19-landmark set; '' marks a landmark WebCeph
 * has no point for (it is skipped). Adjust to match your model.
 */
const LANDMARK_ORDER: string[] = [
  'S',   //  1 Sella
  'N',   //  2 Nasion
  'Or',  //  3 Orbitale
  'Po',  //  4 Porion
  'A',   //  5 Subspinale (A-point)
  'B',   //  6 Supramentale (B-point)
  'Pog', //  7 Pogonion
  '',    //  8 Menton (no WebCeph point)
  'Gn',  //  9 Gnathion
  '',    // 10 Gonion (no WebCeph point)
  '',    // 11 Lower incisor tip (no WebCeph point)
  '',    // 12 Upper incisor tip (no WebCeph point)
  'Ls',  // 13 Upper lip (~ Labrale superius)
  'Li',  // 14 Lower lip (~ Labrale inferius)
  'Sn',  // 15 Subnasale
  '',    // 16 Soft-tissue pogonion (no WebCeph point)
  '',    // 17 Posterior nasal spine (no WebCeph point)
  '',    // 18 Anterior nasal spine (no WebCeph point)
  '',    // 19 Articulare (no WebCeph point)
];

// onnxruntime-web is loaded lazily so it (and its WASM) is a separate chunk
// fetched only when ONNX inference actually runs.
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

/** Bilinear sample of a single channel from the source ImageData (0..255). */
const sample = (data: Uint8ClampedArray, w: number, h: number, fx: number, fy: number, c: number): number => {
  const x = fx * (w - 1);
  const y = fy * (h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const dx = x - x0;
  const dy = y - y0;
  const at = (px: number, py: number) => data[(py * w + px) * 4 + c];
  const top = at(x0, y0) * (1 - dx) + at(x1, y0) * dx;
  const bot = at(x0, y1) * (1 - dx) + at(x1, y1) * dx;
  return top * (1 - dy) + bot * dy;
};

/** ImageData -> normalised CHW float32 tensor of shape [C, SIZE, SIZE]. */
const preprocess = (imageData: ImageData): Float32Array => {
  const { data, width, height } = imageData;
  const out = new Float32Array(INPUT_CHANNELS * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let y = 0; y < SIZE; y++) {
    const fy = y / (SIZE - 1);
    for (let x = 0; x < SIZE; x++) {
      const fx = x / (SIZE - 1);
      const idx = y * SIZE + x;
      if (INPUT_CHANNELS === 1) {
        const r = sample(data, width, height, fx, fy, 0);
        const g = sample(data, width, height, fx, fy, 1);
        const b = sample(data, width, height, fx, fy, 2);
        const gray = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        out[idx] = (gray - MEAN[0]) / STD[0];
      } else {
        for (let c = 0; c < 3; c++) {
          const v = sample(data, width, height, fx, fy, c) / 255;
          out[c * plane + idx] = (v - MEAN[c]) / STD[c];
        }
      }
    }
  }
  return out;
};

/** Decode heatmaps [N, Hh, Wh] into normalised [0,1] landmark coordinates. */
const decodeHeatmaps = (data: Float32Array, dims: readonly number[]): Array<{ x: number; y: number }> => {
  // dims = [1, N, Hh, Wh]
  const n = dims[dims.length - 3];
  const hh = dims[dims.length - 2];
  const ww = dims[dims.length - 1];
  const out: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < n; k++) {
    let best = -Infinity;
    let bx = 0;
    let by = 0;
    const base = k * hh * ww;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < ww; x++) {
        const v = data[base + y * ww + x];
        if (v > best) { best = v; bx = x; by = y; }
      }
    }
    out.push({ x: bx / (ww - 1), y: by / (hh - 1) });
  }
  return out;
};

const onnxPredictor: LandmarkPredictor = {
  id: 'onnx-hrnet',
  isReady: () => ready,
  predict: async ({ imageData, width, height, symbols }: PredictionInput): Promise<PredictedLandmark[]> => {
    const ort = await getOrt();
    const session = await getSession();

    const tensor = new ort.Tensor('float32', preprocess(imageData), [1, INPUT_CHANNELS, SIZE, SIZE]);
    const feeds: Record<string, ORT.Tensor> = { [session.inputNames[0]]: tensor };
    const output = await session.run(feeds);
    const result = output[session.outputNames[0]];
    const data = result.data as Float32Array;

    // Per-landmark normalised [0,1] coordinates of the original image.
    const coords = OUTPUT_IS_HEATMAP
      ? decodeHeatmaps(data, result.dims)
      : Array.from({ length: Math.floor(data.length / 2) }, (_, i) => ({ x: data[i * 2], y: data[i * 2 + 1] }));

    const requested = new Set(symbols);
    const results: PredictedLandmark[] = [];
    for (let i = 0; i < LANDMARK_ORDER.length && i < coords.length; i++) {
      const symbol = LANDMARK_ORDER[i];
      if (symbol === '' || !requested.has(symbol)) {
        continue;
      }
      results.push({ symbol, x: coords[i].x * width, y: coords[i].y * height });
    }
    return results;
  },
};

export default onnxPredictor;
