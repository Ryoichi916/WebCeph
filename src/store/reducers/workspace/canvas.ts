import { handleActions } from 'utils/store';
import { createSelector } from 'reselect';
import Tools from 'editorTools';

import { getActiveWorkspaceId } from './activeId';
import { getWorkspaceSettingsById, getAllWorkspacesSettings } from './settings';

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
      width: Math.max(Math.min(rect.width, winW) - STEPPER_WIDTH, 0),
      height: Math.max(Math.min(rect.height, winH) - TOOLBAR_HEIGHT, 0),
    };
  }
  return {
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  };
};
