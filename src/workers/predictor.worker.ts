import { getActivePredictor } from 'predictors';
import { PredictionInput } from 'predictors/types';

// Runs landmark inference off the main thread. Receives a PredictionInput
// (structured-cloned, including the decoded ImageData) and posts back either
// the predictions or an error message.
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent) => {
  const input = event.data as PredictionInput;
  try {
    const results = await getActivePredictor().predict(input);
    ctx.postMessage({ ok: true, results });
  } catch (e) {
    ctx.postMessage({ ok: false, error: { message: (e as Error).message } });
  }
};
