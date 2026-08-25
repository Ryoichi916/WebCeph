import { Store, Middleware } from 'redux';
import isEmpty from 'lodash/isEmpty';

import { isActionOfType } from 'utils/store';
import { autoPlotLandmarks } from 'actions/workspace';
import { getManualLandmarks, getSkippedSteps } from 'store/reducers/workspace/image';
import { getManualSteps } from 'store/reducers/workspace/analyses';

/**
 * Keeps the workspace usable across analysis switches: when the user changes
 * the active analysis on an image that already has a tracing (auto-plotted or
 * hand-placed landmarks), any additional landmarks the new analysis needs are
 * plotted automatically — the same underlying `autoPlotLandmarks` dispatch the
 * toolbar's Auto-plot button uses, so the results arrive as a single undoable
 * batch and hand-tuned points are never overwritten. Without this, switching
 * e.g. Downs → Dental left the stepper part-complete and the Summary silently
 * disabled.
 *
 * Switching before any landmark exists does nothing: an empty canvas stays
 * empty until the user chooses to plot.
 *
 * A landmark the clinician explicitly removed (AnalysisStepper's Remove
 * button, or the eraser tool) is excluded from what gets refilled here: its
 * absence from `placed` is not "never touched", it is "on purpose, redoing
 * this by hand" (see the `skippedSteps` write in
 * `REMOVE_MANUAL_LANDMARK_REQUESTED`). Switching away and back used to treat
 * that removal as if it had never happened — the auto-plot placeholder simply
 * reappeared where the clinician had just deleted it, with no way to keep it
 * pending. The explicit `symbols` list passed to `autoPlotLandmarks` below is
 * what keeps that symbol out of *this* completion pass; an explicit Auto-plot
 * click from the toolbar (which passes no `symbols` and so fills every unplaced
 * step) is unaffected and will still restore it if the clinician asks for that.
 */
const middleware = ({ getState, dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => (action: GenericAction) => {
    const result = next(action);
    if (!isActionOfType(action, 'SET_ACTIVE_ANALYSIS_REQUESTED')) {
      return result;
    }

    // The reducer has already applied the new analysis id (next was called
    // above), so the selectors below see the *new* analysis' steps.
    const state = getState();
    const { imageId } = action.payload;

    const placed = getManualLandmarks(state)(imageId);
    if (isEmpty(placed)) {
      return result;
    }

    const skipped = getSkippedSteps(state)(imageId);
    const missing = getManualSteps(state)(imageId)
      .filter(({ symbol }) => placed[symbol] === undefined && skipped[symbol] !== true);
    if (missing.length > 0) {
      dispatch(autoPlotLandmarks({ imageId, symbols: missing.map(({ symbol }) => symbol) }));
    }
    return result;
  };

export default middleware as Middleware;
