import {
  createStore, applyMiddleware, combineReducers, compose,
  Middleware, Reducer, ReducersMapObject, StoreEnhancer,
} from 'redux';
import reducers from './reducers';
import fetchAnalysisMiddleware from './middleware/fetchAnalysis';
import exportMiddleware from './middleware/export';
import importMiddleware from './middleware/import';
import autoScaleMiddleware from './middleware/autoScale';
import autoPlotMiddleware from './middleware/autoPlot';
import analysisSwitchMiddleware from './middleware/analysisSwitch';
import analysisDefaultMiddleware from './middleware/analysisDefault';
import referencePlotMiddleware from './middleware/referencePlot';
import exportImageMiddleware from './middleware/exportImage';
import projectMiddleware from './middleware/project';
import compatibilityMiddleware from './middleware/compatibility';
import fetchLocaleMiddleware from './middleware/fetchLocale';
import {
  saveStateMiddleware,
  loadStateMiddleware,
  clearStateMiddleware,
} from './middleware/persistence';
import workspaceManagerMiddleware from './middleware/workspaceManager';

declare const window: Window & { devToolsExtension?: () => any };

const reducer = combineReducers<StoreState>(reducers as ReducersMapObject);

const middlewares: Middleware[] = [
  loadStateMiddleware,
  clearStateMiddleware,
  compatibilityMiddleware,
  fetchAnalysisMiddleware,
  fetchLocaleMiddleware,
  workspaceManagerMiddleware,
  importMiddleware,
  exportMiddleware,
  autoScaleMiddleware,
  autoPlotMiddleware,
  analysisDefaultMiddleware,
  analysisSwitchMiddleware,
  referencePlotMiddleware,
  exportImageMiddleware,
  projectMiddleware,
  saveStateMiddleware,
];

if (__DEBUG__) {
  // middlewares.push(analyticsMiddleware);
  const { createLogger } = require('redux-logger');
  middlewares.push(createLogger({
    diff: true,
    duration: true,
    timestamp: true,
  }));
}

const enableLoadingProject = (r: Reducer<StoreState>): Reducer<StoreState> => {
  return (state: StoreState, action: GenericAction) => {
    if (action.type === 'LOAD_PROJECT_SUCCEEDED') {
      // Replace the project slices (and active patient) wholesale.
      return {
        ...r(state, action),
        ...action.payload,
      };
    }
    return r(state, action);
  };
};

// ---- Undo/redo ------------------------------------------------------------
// A small, focused history of the tracing slice ('images.tracing'): every
// landmark edit pushes the previous slice onto the past stack; UNDO/REDO swap
// slices between the stacks. Kept at the reducer level (not middleware) so a
// single action produces a single, consistent state transition.

type TracingSlice = StoreState['images.tracing'];

const UNDOABLE_ACTIONS: { [type: string]: boolean } = {
  ADD_MANUAL_LANDMARK_REQUESTED: true,
  ADD_MANUAL_LANDMARKS_BATCH_REQUESTED: true,
  REMOVE_MANUAL_LANDMARK_REQUESTED: true,
  SKIP_MANUAL_STEP_REQUESTED: true,
  UNSKIP_MANUAL_STEP_REQUESTED: true,
};

// Fired on every frame of an in-progress landmark drag (mouse still down) —
// deliberately NOT in UNDOABLE_ACTIONS (a whole drag must collapse into the
// single undo step its eventual commit represents, not one step per pixel of
// mouse movement), yet it does mutate 'images.tracing' like any undoable
// action does, so the tracing canvas, computed measurements and profilogram
// can all track the point live (@see MOVE_MANUAL_LANDMARK_LIVE in
// webceph.d.ts). enableUndoRedo below gives it one piece of special handling:
// capturing the slice as it stood before the gesture started, in
// `history.dragBaseline`, so the commit that ends the gesture pushes that
// true pre-drag snapshot onto `history.past` instead of the already-mid-drag
// one that would otherwise sit in `state['images.tracing']` by then.
const LIVE_DRAG_ACTION = 'MOVE_MANUAL_LANDMARK_LIVE';

// Wholesale state replacements invalidate the recorded snapshots.
const HISTORY_CLEARING_ACTIONS: { [type: string]: boolean } = {
  LOAD_PROJECT_SUCCEEDED: true,
  LOAD_PERSISTED_STATE_SUCCEEDED: true,
  CLOSE_IMAGE_REQUESTED: true,
};

const HISTORY_LIMIT = 100;

const enableUndoRedo = (r: Reducer<StoreState>): Reducer<StoreState> => {
  return (state: StoreState, action: GenericAction): StoreState => {
    if (typeof state === 'undefined') {
      return r(state, action);
    }
    const past: TracingSlice[] = state['history.past'] || [];
    const future: TracingSlice[] = state['history.future'] || [];
    if (action.type === 'UNDO_REQUESTED') {
      if (past.length === 0) {
        return state;
      }
      return {
        ...state,
        'images.tracing': past[past.length - 1],
        'history.past': past.slice(0, past.length - 1),
        'history.future': [state['images.tracing'], ...future],
        // Defensive only (a real drag holds the mouse button, so UNDO/REDO
        // cannot ordinarily fire mid-gesture): drop any dangling baseline
        // rather than have a later commit push a now-stale snapshot.
        'history.dragBaseline': null,
      };
    }
    if (action.type === 'REDO_REQUESTED') {
      if (future.length === 0) {
        return state;
      }
      return {
        ...state,
        'images.tracing': future[0],
        'history.past': [...past, state['images.tracing']],
        'history.future': future.slice(1),
        'history.dragBaseline': null,
      };
    }
    if (action.type === LIVE_DRAG_ACTION) {
      const result = r(state, action);
      // Only the first live update of a gesture records the baseline — once
      // set, later ones in the same gesture must leave it alone, or it would
      // keep sliding forward to each already-mid-drag position instead of
      // staying pinned to where the gesture began.
      const dragBaseline = state['history.dragBaseline'] || state['images.tracing'];
      return { ...result, 'history.dragBaseline': dragBaseline };
    }
    const result = r(state, action);
    if (HISTORY_CLEARING_ACTIONS[action.type] === true) {
      if (past.length === 0 && future.length === 0 && state['history.dragBaseline'] == null) {
        return result;
      }
      return { ...result, 'history.past': [], 'history.future': [], 'history.dragBaseline': null };
    }
    if (
      UNDOABLE_ACTIONS[action.type] === true &&
      result['images.tracing'] !== state['images.tracing']
    ) {
      // A commit ending a drag gesture (see LIVE_DRAG_ACTION above) must
      // snapshot the slice as it stood BEFORE that gesture's live updates,
      // not the current (already-mid-drag) one, or Undo would put the point
      // back wherever the mouse last was during the drag instead of where it
      // started. Any other undoable action (no drag baseline recorded) keeps
      // snapshotting the current pre-action state exactly as before.
      const snapshot = state['history.dragBaseline'] || state['images.tracing'];
      return {
        ...result,
        'history.past': [
          ...past.slice(-(HISTORY_LIMIT - 1)),
          snapshot,
        ],
        'history.future': [],
        'history.dragBaseline': null,
      };
    }
    return result;
  };
};

const enableLoadingPersistedState = (r: Reducer<StoreState>): Reducer<StoreState> => {
  return (state: StoreState, action: GenericAction) => {
    if (action.type === 'LOAD_PERSISTED_STATE_SUCCEEDED') {
      return {
        ...r(state, action),
        ...action.payload,
      };
    }
    return r(state, action);
  };
};

function addDevTools() {
  if (process.env.NODE_ENV !== 'production' && !!window.devToolsExtension) {
    return window.devToolsExtension();
  }
  return (f: any) => f;
}

const enhancedReducer =
  enableUndoRedo(enableLoadingProject(enableLoadingPersistedState(reducer)));

declare var module: __WebpackModuleApi.Module;

const createConfiguredStore = () => {
  const store = createStore<StoreState>(
    enhancedReducer,
    compose(
      applyMiddleware(...middlewares),
      addDevTools(),
    ) as StoreEnhancer<StoreState>,
  );

  if (module.hot) {
    module.hot.accept('./reducers', () => {
      const nextReducer = require('./reducers').default;
      store.replaceReducer(nextReducer);
    });
  }
  return store;
};

export default createConfiguredStore;
