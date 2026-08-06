import { Store, Middleware } from 'redux';
import isEmpty from 'lodash/isEmpty';

import { isActionOfType } from 'utils/store';
import { autoPlotLandmarks } from 'actions/workspace';
import { getManualLandmarks } from 'store/reducers/workspace/image';
import { getManualSteps } from 'store/reducers/workspace/analyses';

/**
 * Keeps the workspace usable across analysis switches: when the user changes
 * the active analysis on an image that already has a tracing (auto-plotted or
 * hand-placed landmarks), any additional landmarks the new analysis needs are
 * plotted automatically — the exact same dispatch as the toolbar's Auto-plot
 * button, so the results arrive as a single undoable batch and hand-tuned
 * points are never overwritten. Without this, switching e.g. Downs → Dental
 * left the stepper part-complete and the Summary silently disabled.
 *
 * Switching before any landmark exists does nothing: an empty canvas stays
 * empty until the user chooses to plot.
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

    const missing = getManualSteps(state)(imageId)
      .filter(({ symbol }) => placed[symbol] === undefined);
    if (missing.length > 0) {
      dispatch(autoPlotLandmarks({ imageId }));
    }
    return result;
  };

export default middleware as Middleware;
