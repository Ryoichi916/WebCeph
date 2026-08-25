import createZoomWithWheel, { ZOOM_MIN, ZOOM_MAX } from './zoomWithWheel';
import { Cursor } from 'utils/constants';

import { getScale, computeAnchoredZoomOffset } from 'store/reducers/workspace/canvas';
import { getActiveImageId } from 'store/reducers/workspace/image';

import { setScale, setScaleOffset } from 'actions/workspace';

import clamp from 'lodash/clamp';

export const createZoomWithClick: EditorToolCreator = (
  state: StoreState,
) => ({
  ...createZoomWithWheel(state),
  onCanvasLeftClick(dispatch, x, y) {
    const imageId = getActiveImageId(state)!;
    const newScale = clamp(getScale(state) * 1.2, ZOOM_MIN, ZOOM_MAX);
    // @see zoomWithWheel's onCanvasMouseWheel for why this pairs with an
    // anchored offset instead of just a scale change.
    const offset = computeAnchoredZoomOffset(state, imageId, x, y, newScale);
    dispatch(setScale({ imageId, scale: newScale }));
    dispatch(setScaleOffset({ imageId, left: offset.left, top: offset.top }));
  },
  onCanvasRightClick(dispatch, x, y) {
    const imageId = getActiveImageId(state)!;
    const newScale = clamp(getScale(state) * 0.8, ZOOM_MIN, ZOOM_MAX);
    const offset = computeAnchoredZoomOffset(state, imageId, x, y, newScale);
    dispatch(setScale({ imageId, scale: newScale }));
    dispatch(setScaleOffset({ imageId, left: offset.left, top: offset.top }));
  },
  getCursorForCanvas() {
    return Cursor.ZOOM;
  },
  shouldShowLens: false,
});

export default createZoomWithClick;
