import { PredictionInput, PredictedLandmark } from './types';

interface WorkerResponse {
  ok: boolean;
  results?: PredictedLandmark[];
  error?: { message: string };
}

/**
 * Runs a prediction in a dedicated Web Worker (off the main thread). The worker
 * is spawned per request and terminated once it responds. The image data is
 * structured-cloned to the worker.
 */
export function runPredictionInWorker(input: PredictionInput): Promise<PredictedLandmark[]> {
  return new Promise<PredictedLandmark[]>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/predictor.worker.ts', import.meta.url),
    );
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as WorkerResponse;
      worker.terminate();
      if (data.ok && data.results) {
        resolve(data.results);
      } else {
        reject(new Error(data.error ? data.error.message : 'Prediction failed'));
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(new Error(event.message || 'Predictor worker failed to run'));
    };
    worker.postMessage(input);
  });
}
