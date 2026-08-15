export enum ErrorCode {
  INCOMPATIBLE_IMAGE_TYPE,
  UNKNOWN,
}

export enum ImageWorkerAction {
  READ_AS_DATA_URL,
  PERFORM_EDITS,
  IS_CEPHALO,
};

export const Cursor = {
  SELECT: 'SELECT',
  ADD_LANDMARK: 'ADD_LANDMARK',
  REMOVE_LANDMARK: 'REMOVE_LANDMARK',
  REMOVE_LANDMARK_NO_TARGET: 'REMOVE_LANDMARK_NO_TARGET',
  REMOVE_LANDMARK_DISABLED: 'REMOVE_LANDMARK_DISABLED',
  MOVE_LANDMARK: 'MOVE_LANDMARK',
  MOVING_LANDMARK: 'MOVING_LANDMARK',
  ZOOM: 'ZOOM',
  ZOOM_IN: 'ZOOM_IN',
  ZOOM_OUT: 'ZOOM_OUT',
  EXPLAIN: 'EXPLAIN',
};

const cursorToCSSMap: Record<string, Array<null | string>> = {
  [Cursor.SELECT]: [null],
  [Cursor.ADD_LANDMARK]: [null, 'crosshair', 'cell'],
  [Cursor.REMOVE_LANDMARK]: ['draw-eraser', 'cell', 'crosshair'],
  [Cursor.REMOVE_LANDMARK_NO_TARGET]: [null, 'not-allowed'],
  [Cursor.REMOVE_LANDMARK_DISABLED]: [null, 'not-allowed', 'no-drop'],
  [Cursor.MOVE_LANDMARK]: [null, 'move'],
  [Cursor.MOVING_LANDMARK]: [null, 'grabbing'],
  [Cursor.ZOOM]: [null, 'zoom-in'],
  [Cursor.ZOOM_IN]: [null, 'zoom-in'],
  [Cursor.ZOOM_OUT]: [null, 'zoom-out'],
  [Cursor.EXPLAIN]: [null, 'help'],
};

import memoize from 'lodash/memoize';

declare var require: __WebpackModuleApi.RequireFunction;

// `esModule=false` keeps file-loader returning the URL string itself. Under
// webpack 5 the loader defaults to an ES module, so a bare `file-loader!`
// request hands back a module namespace object and the custom cursor below
// would render as `url([object Module])` — an invalid value the browser drops.
const requireCursor = require.context('file-loader?esModule=false!./cursors', false, /.png$/i);

export const mapCursor = memoize((cursor: string | undefined): string => {
  let value = '';
  if (cursor !== undefined) {
    const customCursor = cursorToCSSMap[cursor][0];
    if (customCursor !== null) {
      const url = requireCursor(`./${customCursor}.png`);
      value = `url(${url}) 0 22, auto`;
    } else {
      value = cursorToCSSMap[cursor][1] || 'auto';
    }
    return value;
  }
  return 'auto';
});
