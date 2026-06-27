/**
 * A predicted landmark, in original-image pixel coordinates (pre-flip), matching
 * the space in which manual landmarks are stored.
 */
export interface PredictedLandmark {
  /** A WebCeph landmark symbol, e.g. 'N', 'S', 'Or'. */
  symbol: string;
  x: number;
  y: number;
}

/**
 * Input to a landmark predictor. The image is provided already decoded as
 * `ImageData` so predictors are DOM-agnostic and runnable inside a Web Worker.
 */
export interface PredictionInput {
  imageData: ImageData;
  /** Original image dimensions, in pixels. */
  width: number;
  height: number;
  /** The landmark symbols the caller needs predicted. */
  symbols: string[];
}

/**
 * A pluggable cephalometric landmark predictor. The demo implementation is a
 * deterministic heuristic; a real backend (e.g. onnxruntime-web) implements the
 * same interface and is swapped in via `getActivePredictor`.
 */
export interface LandmarkPredictor {
  readonly id: string;
  /** Whether the predictor is ready to run (e.g. its model has loaded). */
  isReady(): boolean;
  predict(input: PredictionInput): Promise<PredictedLandmark[]>;
}
