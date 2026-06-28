import type * as ORT from 'onnxruntime-web';
import { LandmarkPredictor, PredictionInput, PredictedLandmark } from './types';

/**
 * onnxruntime-web backend for cephalometric landmark detection.
 *
 * This is wired to the MIT-licensed HRNet-W32 cephalometric model
 * `cwlachap/hrnet-cephalometric-landmark-detection` (19 lateral landmarks,
 * heatmap regression). No model ships with WebCeph; this backend is opt-in (see
 * USE_ONNX in predictors/index.ts). To enable it:
 *
 *   1. Convert the model to ONNX (see tools/convert_hrnet_to_onnx.py) and place
 *      it at MODEL_URL.
 *   2. Set USE_ONNX = true in predictors/index.ts.
 *
 * The preprocessing and decoding below mirror the model's own pipeline exactly
 * (src/dataset.py / src/heatmaps.py in the model repo), so changing them will
 * degrade accuracy unless the model is retrained:
 *
 *   - input:  1 x 3 x SIZE x SIZE float32, RGB, **letterbox** resized
 *             (aspect-ratio preserving + centred black padding), then scaled to
 *             [0,1] and ImageNet-normalised.
 *   - output: 1 x 19 x HEATMAP x HEATMAP float32 heatmaps; each landmark is the
 *             **soft-argmax** (softmax-weighted centroid) of its channel.
 *   - decode: heatmap coords -> input (SIZE) space (x4) -> original image space
 *             by inverting the letterbox transform.
 */

// ---- Model configuration (match these to the converted model) --------------
const MODEL_URL = '/models/cephalometric.onnx';
const SIZE = 768;          // model input size (INPUT.IMAGE_SIZE)
const HEATMAP = 192;       // model heatmap size (INPUT.HEATMAP_SIZE = SIZE / 4)
// Per-channel normalisation (ImageNet, as trained).
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Maps each model output channel (index) to a WebCeph landmark symbol. Order is
 * the standard ISBI-2015 19-landmark set the model was trained on; '' marks a
 * landmark WebCeph has no point for (it is skipped).
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

/** Bilinear sample of one channel (c=0..2) from the source ImageData (0..255). */
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

/** The letterbox transform from original-image space to SIZE x SIZE input space. */
interface Letterbox {
  scale: number;
  padLeft: number;
  padTop: number;
  newW: number;
  newH: number;
}

const letterboxOf = (width: number, height: number): Letterbox => {
  const scale = Math.min(SIZE / width, SIZE / height);
  const newW = Math.floor(width * scale);
  const newH = Math.floor(height * scale);
  const padLeft = Math.floor((SIZE - newW) / 2);
  const padTop = Math.floor((SIZE - newH) / 2);
  return { scale, padLeft, padTop, newW, newH };
};

/**
 * ImageData -> normalised CHW float32 tensor [3, SIZE, SIZE] using the model's
 * letterbox (aspect-preserving resize + centred black padding). Padding pixels
 * are 0 before normalisation, matching the training pipeline.
 */
const preprocess = (imageData: ImageData, lb: Letterbox): Float32Array => {
  const { data, width, height } = imageData;
  const out = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  const { padLeft, padTop, newW, newH } = lb;
  for (let py = 0; py < SIZE; py++) {
    const insideY = py >= padTop && py < padTop + newH;
    const fy = insideY ? (py - padTop) / (newH - 1) : 0;
    for (let px = 0; px < SIZE; px++) {
      const idx = py * SIZE + px;
      const insideX = px >= padLeft && px < padLeft + newW;
      if (insideY && insideX) {
        const fx = (px - padLeft) / (newW - 1);
        for (let c = 0; c < 3; c++) {
          const v = sample(data, width, height, fx, fy, c) / 255;
          out[c * plane + idx] = (v - MEAN[c]) / STD[c];
        }
      } else {
        // Black padding (raw 0) carried through normalisation.
        for (let c = 0; c < 3; c++) {
          out[c * plane + idx] = -MEAN[c] / STD[c];
        }
      }
    }
  }
  return out;
};

/**
 * Soft-argmax decode of heatmaps [N, HEATMAP, HEATMAP] -> per-channel coordinate
 * in heatmap-grid space [0, HEATMAP). Mirrors soft_argmax_2d (temperature 1,
 * un-normalised) from the model repo: softmax over each map, then its centroid.
 */
const softArgmax = (data: Float32Array, n: number, hh: number, ww: number): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  const len = hh * ww;
  for (let k = 0; k < n; k++) {
    const base = k * len;
    let max = -Infinity;
    for (let i = 0; i < len; i++) {
      const v = data[base + i];
      if (v > max) { max = v; }
    }
    let sum = 0;
    let ex = 0;
    let ey = 0;
    let i = 0;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < ww; x++, i++) {
        const e = Math.exp(data[base + i] - max);
        sum += e;
        ex += e * x;
        ey += e * y;
      }
    }
    out.push({ x: ex / sum, y: ey / sum });
  }
  return out;
};

const onnxPredictor: LandmarkPredictor = {
  id: 'onnx-hrnet',
  isReady: () => ready,
  predict: async ({ imageData, width, height, symbols }: PredictionInput): Promise<PredictedLandmark[]> => {
    const ort = await getOrt();
    const session = await getSession();

    const lb = letterboxOf(width, height);
    const tensor = new ort.Tensor('float32', preprocess(imageData, lb), [1, 3, SIZE, SIZE]);
    const feeds: Record<string, ORT.Tensor> = { [session.inputNames[0]]: tensor };
    const output = await session.run(feeds);
    const result = output[session.outputNames[0]];
    const data = result.data as Float32Array;

    // dims = [1, N, Hh, Ww]
    const dims = result.dims;
    const n = dims[dims.length - 3];
    const hh = dims[dims.length - 2];
    const ww = dims[dims.length - 1];
    const grid = softArgmax(data, n, hh, ww);

    const inputToHeatmap = SIZE / HEATMAP; // heatmap-grid -> input(SIZE) space
    const requested = new Set(symbols);
    const results: PredictedLandmark[] = [];
    for (let i = 0; i < LANDMARK_ORDER.length && i < grid.length; i++) {
      const symbol = LANDMARK_ORDER[i];
      if (symbol === '' || !requested.has(symbol)) {
        continue;
      }
      // heatmap grid -> input(SIZE) space, then invert the letterbox to the
      // original image (subtract padding, divide by scale).
      const xInput = grid[i].x * inputToHeatmap;
      const yInput = grid[i].y * inputToHeatmap;
      results.push({
        symbol,
        x: (xInput - lb.padLeft) / lb.scale,
        y: (yInput - lb.padTop) / lb.scale,
      });
    }
    return results;
  },
};

export default onnxPredictor;
