import createTrackCursor from './trackCursor';

import { setScale } from 'actions/workspace';
import { getScale } from 'store/reducers/workspace/canvas';
import { getActiveImageId } from 'store/reducers/workspace/image';

import clamp from 'lodash/clamp';
import assign from 'lodash/assign';

const zoomIntensity = 0.2;

// Lower bound for the user's zoom multiplier (1 = fit-to-canvas, applied on
// top of the letterbox scale computed in TracingViewer/connected.ts). In this
// app's fixed-viewport layout, fit-to-screen (1) already shows the whole film,
// so zooming out further only shrinks it into a small thumbnail surrounded by
// dead canvas — a corner it had almost no legitimate use in. 0.5 keeps a
// working zoom-out range (e.g. backing off slightly to see a placed point in
// context) without reaching that degenerate state. Mirrored in
// TracingToolbar's ZOOM_MIN, which the zoom-out button is bound by — keep the
// two in sync.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

const createZoomWithWheel: EditorToolCreator = (
  state: StoreState,
) => assign(
  createTrackCursor(state),
  {
    onCanvasMouseEnter() {
      // @TODO
    },
    onCanvasMouseLeave() {
      // @TODO
    },
    onCanvasMouseWheel: (dispatch, _x, _y, delta) => {
      const wheel = delta / 120;
      const zoom = Math.exp(-wheel * zoomIntensity);
      const scale = getScale(state);
      const newScale = clamp(scale * zoom, ZOOM_MIN, ZOOM_MAX);
      dispatch(setScale({
      imageId: getActiveImageId(state)!,
        scale: newScale,
      }));
    },
    shouldShowLens: false,
  } as EditorTool,
);

export default createZoomWithWheel;
