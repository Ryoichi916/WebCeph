import { handleActions } from 'utils/store';
import { createSelector } from 'reselect';
import Tools from 'editorTools';

import { getActiveWorkspaceId } from './activeId';
import { getWorkspaceSettingsById, getAllWorkspacesSettings } from './settings';
import { getImageWidth, getImageHeight } from './image';

const KEY_CANVAS_MOUSE_POSITION: StoreKey = 'workspace.canvas.mouse.position';
const KEY_CANVAS_TOOL_ID: StoreKey = 'workspace.canvas.tools.activeToolId';
const KEY_HIGHLIGHTED_STEP: StoreKey = 'workspace.canvas.highlightedStep';
const KEY_SCALE: StoreKey = 'workspace.canvas.scale.value';
const KEY_SCALE_ORIGIN: StoreKey = 'workspace.canvas.scale.offset';
const KEY_PROFILOGRAM_SHOWN: StoreKey = 'workspace.canvas.profilogram.isShown';

const reducers: Partial<ReducerMap> = {
  [KEY_CANVAS_MOUSE_POSITION]: handleActions<typeof KEY_CANVAS_MOUSE_POSITION>(
    {
      MOUSE_POSITION_CHANGED: (_, { payload }) => payload,
    },
    null,
  ),
  [KEY_CANVAS_TOOL_ID]: handleActions<typeof KEY_CANVAS_TOOL_ID>(
    {
      SET_ACTIVE_TOOL_REQUESTED: (_, { payload }) => payload,
    },
    'ADD_POINT',
  ),
  [KEY_HIGHLIGHTED_STEP]: handleActions<typeof KEY_HIGHLIGHTED_STEP>(
    {
      HIGHLIGHT_STEP_ON_CANVAS_REQUESTED: (_, { payload }) => payload.symbol,
      UNHIGHLIGHT_STEP_ON_CANVAS_REQUESTED: (_, __) => null,
    },
    null,
  ),
  [KEY_SCALE]: handleActions<typeof KEY_SCALE>(
    {
      SET_SCALE_REQUESTED: (_, { payload }) => {
        return payload.scale;
      },
      RESET_WORKSPACE_REQUESTED: () => 1,
    },
    1,
  ),
  [KEY_SCALE_ORIGIN]: handleActions<typeof KEY_SCALE_ORIGIN>(
    {
      SET_SCALE_OFFSET_REQUESTED: (_, { payload }) => {
        return {
          top: Math.round(payload.top),
          left: Math.round(payload.left),
        };
      },
      RESET_WORKSPACE_REQUESTED: () => null,
      // A freshly loaded image starts centered, same as its scale resets to
      // 1 = exactly fitted (@see middleware/autoScale) — otherwise a pan left
      // over from whatever was previously on screen would carry over onto an
      // image of a different size, where it has no reason to still apply.
      LOAD_IMAGE_SUCCEEDED: () => null,
    },
    null,
  ),
  [KEY_PROFILOGRAM_SHOWN]: handleActions<typeof KEY_PROFILOGRAM_SHOWN>(
    {
      TOGGLE_PROFILOGRAM_REQUESTED: (shown) => !shown,
      RESET_WORKSPACE_REQUESTED: () => false,
    },
    false,
  ),
};

export default reducers;

export const getHighlightedStep = (state: StoreState) => state[KEY_HIGHLIGHTED_STEP];
export const isProfilogramShown = (state: StoreState) => state[KEY_PROFILOGRAM_SHOWN];

export const getMousePosition = (state: StoreState) => state[KEY_CANVAS_MOUSE_POSITION];

export const getActiveToolId = (state: StoreState) => state[KEY_CANVAS_TOOL_ID];

export const getState = (state: StoreState) => state;

export const getActiveTool = createSelector(
  getState,
  getActiveToolId,
  (state, id) => Tools[id](state),
);

export const getScale = (state: StoreState) => state[KEY_SCALE];
export const getScaleOrigin = (state: StoreState) => state[KEY_SCALE_ORIGIN];

// The stepper panel and the toolbar share the workspace content area with the
// canvas (see TracingEditor); their sizes must be carved out of the measured
// contentRect or the canvas overflows and scrolls out of view.
const STEPPER_WIDTH = 320; // .stepper in TracingEditor/style.scss
const TOOLBAR_HEIGHT = 44; // .root in TracingToolbar/style.scss

/**
 * How wide the stepper panel is at this window width — **mirrors the media
 * queries on `.stepper` in `TracingEditor/style.scss`**, which is the authority.
 *
 * The panel takes the surplus width of a wide monitor because the film cannot: a
 * canvas fits its image with `min(w/iw, h/ih)`, so a 4:5 cephalogram in a 16:9
 * canvas is bound by the height and renders at the same size at 1280 as at 1920.
 * The two values have to move together — the canvas is sized by subtracting this
 * from the measured content box, and a panel wider than the subtraction would let
 * a *landscape* film (a panoramic) be fitted to a canvas partly under the panel.
 */
const stepperWidth = (windowWidth: number): number => {
  if (windowWidth >= 1800) {
    return 440;
  }
  if (windowWidth >= 1600) {
    return 400;
  }
  return STEPPER_WIDTH;
};

// The space available to the tracing canvas. Preferably the measured size of
// the active workspace's content area (kept up to date by ResizeObservable via
// CANVAS_RESIZED) minus the stepper/toolbar; the window size is only a
// first-render fallback. Used to auto-fit a freshly loaded image (see the
// autoScale middleware) and to size the tracing canvas.
export const getCanvasDimensions = (state: StoreState): { width: number; height: number } => {
  const workspaceId = getActiveWorkspaceId(state);
  const settings = workspaceId !== null
    ? getWorkspaceSettingsById(state)(workspaceId)
    : null;
  let rect = settings && settings.contentRect;
  if (rect === null || rect === undefined) {
    // A workspace added later (a second timepoint from the image rail) may not
    // have been measured yet: React reuses the same Workspace element across
    // tab switches, so its ResizeObserver does not fire again. Every workspace
    // occupies the same content box, so borrow a sibling's measurement rather
    // than falling back to the whole window — which over-scales the image by
    // the width of the rail and the stepper.
    const all = getAllWorkspacesSettings(state);
    for (const id of Object.keys(all)) {
      const other = all[id] && all[id].contentRect;
      if (other && other.width > 0 && other.height > 0) {
        rect = other;
        break;
      }
    }
  }
  if (rect && rect.width > 0 && rect.height > 0) {
    // The observed element can be stretched by its own (overflowing) canvas
    // content, so its measurement must never exceed the viewport — otherwise
    // canvas size and measurement feed back into each other and grow.
    const winW = typeof window !== 'undefined' ? window.innerWidth : rect.width;
    const winH = typeof window !== 'undefined' ? window.innerHeight : rect.height;
    return {
      width: Math.max(Math.min(rect.width, winW) - stepperWidth(winW), 0),
      height: Math.max(Math.min(rect.height, winH) - TOOLBAR_HEIGHT, 0),
    };
  }
  return {
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  };
};

// ---- Pan/zoom geometry --------------------------------------------------
// The tracing canvas is a fixed-size viewport (getCanvasDimensions) holding
// an image drawn at `fitScale * the user's zoom factor`, positioned by an
// (left, top) translate — @see TracingViewer#getTransformAttribute, which is
// the only consumer of getEffectiveOffset. Kept here, alongside getScale and
// getCanvasDimensions, so the wheel/click zoom tools (editorTools/zoomWith*)
// and the viewer compute the exact same numbers instead of two independent
// formulas drifting apart.

/**
 * The scale that letterboxes the image into the canvas — `min(w/iw, h/ih)`,
 * or `1` when either the canvas or the image has no measured size yet (first
 * render, or an image still loading). The user's own zoom (getScale) is a
 * multiplier on top of this.
 */
export const getFitScale = (
  canvas: { width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): number => {
  if (canvas.width > 0 && canvas.height > 0 && imageWidth > 0 && imageHeight > 0) {
    return Math.min(canvas.width / imageWidth, canvas.height / imageHeight);
  }
  return 1;
};

/** The on-screen scale actually applied to the image: fit × the user's zoom. */
export const getEffectiveScale = (state: StoreState) => (imageId: string): number => {
  const canvas = getCanvasDimensions(state);
  const imageWidth = getImageWidth(state)(imageId);
  const imageHeight = getImageHeight(state)(imageId);
  return getFitScale(canvas, imageWidth, imageHeight) * getScale(state);
};

/** The translate that simply centers the (scaled) image inside the canvas. */
const getDefaultOffset = (
  canvas: { width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  scale: number,
): { left: number; top: number } => ({
  left: Math.max(0, (canvas.width - imageWidth * scale) / 2),
  top: Math.max(0, (canvas.height - imageHeight * scale) / 2),
});

/**
 * Keeps a translate within the range that still shows the image filling (or
 * centered within) the canvas on each axis — from flush against one edge to
 * flush against the other — so a pan/zoom gesture can never park the image
 * off in empty space with nothing on screen, and never show a gap on one
 * side while the image overflows the other.
 */
const clampOffset = (
  offset: { left: number; top: number },
  canvas: { width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  scale: number,
): { left: number; top: number } => {
  const clampAxis = (value: number, canvasSize: number, imageSize: number) => {
    const slack = canvasSize - imageSize * scale;
    const min = Math.min(0, slack);
    const max = Math.max(0, slack);
    return Math.min(max, Math.max(min, value));
  };
  return {
    left: clampAxis(offset.left, canvas.width, imageWidth),
    top: clampAxis(offset.top, canvas.height, imageHeight),
  };
};

/**
 * The translate actually used to draw the image (@see
 * TracingViewer#getTransformAttribute): the stored pan/zoom offset if one has
 * been set (@see SET_SCALE_OFFSET_REQUESTED), else the centered default —
 * always clamped against the *current* canvas/image/scale, so a stored offset
 * left over from a differently-sized image or canvas self-corrects instead of
 * parking the image off-screen.
 */
export const getEffectiveOffset = (state: StoreState) => (imageId: string): { left: number; top: number } => {
  const canvas = getCanvasDimensions(state);
  const imageWidth = getImageWidth(state)(imageId);
  const imageHeight = getImageHeight(state)(imageId);
  const scale = getEffectiveScale(state)(imageId);
  const stored = getScaleOrigin(state);
  const base = stored !== null
    ? stored
    : getDefaultOffset(canvas, imageWidth, imageHeight, scale);
  return clampOffset(base, canvas, imageWidth, imageHeight, scale);
};

/**
 * The offset that keeps a given image-space point fixed under the cursor
 * across a scale change from the current user zoom to `newUserScale` — the
 * standard "zoom to point" construction: shift the translate by exactly the
 * distance that point would otherwise move due to the scale delta alone.
 * Used by both wheel-zoom and click-zoom (@see editorTools/zoomWithWheel,
 * editorTools/zoomWithClick) so the image content under the pointer stays
 * put instead of sliding out from under it as the zoom level changes.
 */
export const computeAnchoredZoomOffset = (
  state: StoreState,
  imageId: string,
  cursorImageX: number,
  cursorImageY: number,
  newUserScale: number,
): { left: number; top: number } => {
  const canvas = getCanvasDimensions(state);
  const imageWidth = getImageWidth(state)(imageId);
  const imageHeight = getImageHeight(state)(imageId);
  const fitScale = getFitScale(canvas, imageWidth, imageHeight);
  const oldEffectiveScale = getEffectiveScale(state)(imageId);
  const newEffectiveScale = fitScale * newUserScale;
  const oldOffset = getEffectiveOffset(state)(imageId);
  const delta = newEffectiveScale - oldEffectiveScale;
  const raw = {
    left: oldOffset.left - cursorImageX * delta,
    top: oldOffset.top - cursorImageY * delta,
  };
  return clampOffset(raw, canvas, imageWidth, imageHeight, newEffectiveScale);
};
