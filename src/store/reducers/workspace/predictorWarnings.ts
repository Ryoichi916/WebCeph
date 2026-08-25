import { handleActions } from 'utils/store';
import omit from 'lodash/omit';

const KEY_PLACEHOLDER_WARNING: StoreKey = 'workspace.autoPlot.placeholderWarning';

/**
 * Tracks, per image, whether the demo/placeholder predictor (see
 * `predictors/demo.ts`) has plotted a landmark on it while it is not the
 * bundled sample cephalogram that predictor's template is calibrated
 * against — i.e. whether some of what is on screen for this image was
 * fabricated rather than detected.
 *
 * Deliberately outside `images.tracing`: this is a fact about the current
 * session ("Auto-plot ran its placeholder here, go verify it"), not about the
 * tracing itself, so it must never travel into the exported case file and
 * must never be replayed by undo/redo the way a landmark edit is. Once set
 * for an image it stays set — there is no per-landmark "verified" tracking,
 * so nothing here can honestly claim the warning no longer applies; it is
 * cleared only when the image itself goes away (closed, or a different film
 * loaded onto the same id).
 */
const reducer = handleActions<typeof KEY_PLACEHOLDER_WARNING>(
  {
    PLACEHOLDER_LANDMARKS_PLOTTED: (state, { payload: { imageId } }) => (
      state[imageId] === true ? state : { ...state, [imageId]: true }
    ),
    CLOSE_IMAGE_REQUESTED: (state, { payload: { imageId } }) => (
      state[imageId] === undefined ? state : omit(state, imageId) as typeof state
    ),
    // A fresh (or re-read) film loaded onto this id starts with a clean
    // slate: whatever was on screen before is gone, so the warning must not
    // outlive the image it was raised about.
    LOAD_IMAGE_SUCCEEDED: (state, { payload: { id } }) => (
      state[id] === undefined ? state : omit(state, id) as typeof state
    ),
  },
  {},
);

const reducers: Partial<ReducerMap> = {
  [KEY_PLACEHOLDER_WARNING]: reducer,
};

export default reducers;

export const getAllPlaceholderWarnings = (state: StoreState) =>
  state[KEY_PLACEHOLDER_WARNING] || {};

/** Whether the demo/placeholder predictor has fabricated points on this image. */
export const isPlaceholderAutoPlotWarned = (state: StoreState) => (imageId: string): boolean =>
  getAllPlaceholderWarnings(state)[imageId] === true;
