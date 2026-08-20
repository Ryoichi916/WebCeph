const KEY_PAST: StoreKey = 'history.past';
const KEY_FUTURE: StoreKey = 'history.future';
const KEY_DRAG_BASELINE: StoreKey = 'history.dragBaseline';

type TracingSlice = StoreState['images.tracing'];

// Passthrough reducers: the undo/redo stacks (and the in-progress-drag
// baseline they collapse a whole drag gesture down to — see
// `history.dragBaseline` in webceph.d.ts) are managed by the enableUndoRedo
// reducer enhancer in store/index.ts (it needs access to the whole state to
// snapshot the tracing slice). Registering the keys here keeps combineReducers
// aware of them so it neither strips nor warns about them.
const passthrough = (state: TracingSlice[] = []) => state;
const passthroughBaseline = (state: TracingSlice | null = null) => state;

const reducers: Partial<ReducerMap> = {
  [KEY_PAST]: passthrough,
  [KEY_FUTURE]: passthrough,
  [KEY_DRAG_BASELINE]: passthroughBaseline,
};

export default reducers;

export const getUndoStack = (state: StoreState) => state['history.past'] || [];
export const getRedoStack = (state: StoreState) => state['history.future'] || [];
