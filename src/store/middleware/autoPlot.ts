import { Store, Middleware } from 'redux';
import uniqueId from 'lodash/uniqueId';

import { isActionOfType } from 'utils/store';
import {
  addWorker,
  updateWorker,
  removeWorker,
  addManualLandmarks,
  autoPlotSucceeded,
  autoPlotFailed,
  placeholderLandmarksPlotted,
} from 'actions/workspace';
import {
  getImageProps,
  getManualLandmarks,
} from 'store/reducers/workspace/image';
import { getManualSteps } from 'store/reducers/workspace/analyses';
import { getActivePredictor, runPrediction, predictionsToLandmarks } from 'predictors';
import { runPredictionInWorker } from 'predictors/workerClient';
import { dataUrlToImageData } from 'utils/imageData';
import { isSampleCephImage } from 'utils/sampleCeph';
import { PLACEHOLDER_PREDICTOR_ID } from 'predictors/demo';

/**
 * Orchestrates automatic landmark plotting: gathers the image and the analysis'
 * manual-step symbols, runs the active predictor, and injects the results as a
 * single batched (undoable) manual-landmark update. Predictor failures are
 * surfaced via the worker/error channel without leaving a stuck busy worker.
 */
const middleware = ({ getState, dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => async (action: GenericAction) => {
    if (!isActionOfType(action, 'AUTO_PLOT_LANDMARKS_REQUESTED')) {
      return next(action);
    }
    next(action);

    const state = getState();
    const {
      imageId, overwrite = false, symbols: requested,
    } = action.payload;

    // Normally the active analysis' own manual steps. A caller may name the
    // symbols instead — the clinical report does, because it prints every
    // lateral analysis from one tracing and needs the union of all their
    // landmarks rather than the ones the open analysis happens to require.
    const placed = getManualLandmarks(state)(imageId);
    const steps = requested !== undefined
      ? requested.map((symbol) => ({ symbol }))
      : getManualSteps(state)(imageId);
    const props = getImageProps(state)(imageId);

    if (steps.length === 0) {
      dispatch(autoPlotFailed({
        imageId,
        error: { message: 'Select an analysis before auto-plotting landmarks.' },
      }));
      return;
    }
    if (!props || !props.data) {
      dispatch(autoPlotFailed({
        imageId,
        error: { message: 'Load an image before auto-plotting landmarks.' },
      }));
      return;
    }

    const symbols = steps
      .map((step) => step.symbol)
      .filter((symbol) => overwrite || placed[symbol] === undefined);

    if (symbols.length === 0) {
      // Nothing to do; do not pollute the undo history.
      dispatch(autoPlotSucceeded({ imageId }));
      return;
    }

    const workerId = uniqueId('predictor_');
    dispatch(addWorker({ id: workerId, type: 'tracing_worker', isBusy: true, error: null }));

    try {
      const imageData = await dataUrlToImageData(props.data);
      const input = {
        imageData,
        width: props.width,
        height: props.height,
        symbols,
      };
      // Prefer off-main-thread inference; fall back to the main thread if a
      // worker cannot be spawned (e.g. a restrictive environment).
      let predictions;
      try {
        predictions = await runPredictionInWorker(input);
      } catch (workerError) {
        predictions = await runPrediction(input);
      }
      const landmarks = predictionsToLandmarks(
        predictions, props.width, props.height, placed, overwrite,
      );
      dispatch(addManualLandmarks({ imageId, landmarks }));
      // The demo predictor's positions (see `predictors/demo.ts`) are honest
      // only for the exact bundled sample film they were read off — plotted
      // on any other image they are fabricated, not detected, however
      // real-looking the resulting angles are. Surface that once per image so
      // TracingEditor/AnalysisResultsViewer can warn the clinician, rather
      // than letting a fully "complete" tracing pass as a real reading.
      if (
        getActivePredictor().id === PLACEHOLDER_PREDICTOR_ID &&
        !isSampleCephImage(props.data) &&
        Object.keys(landmarks).length > 0
      ) {
        dispatch(placeholderLandmarksPlotted({ imageId }));
      }
      dispatch(removeWorker(workerId));
      dispatch(autoPlotSucceeded({ imageId }));
    } catch (e) {
      dispatch(updateWorker({ id: workerId, isBusy: false, error: { message: e.message } }));
      dispatch(removeWorker(workerId));
      dispatch(autoPlotFailed({ imageId, error: { message: e.message } }));
    }
  };

export default middleware as Middleware;
