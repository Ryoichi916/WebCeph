import { Store, Middleware } from 'redux';

import {
  setScale,
} from 'actions/workspace';

import { isActionOfType } from 'utils/store';

const middleware = ({ dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => async (action: GenericAction) => {
    if (!isActionOfType(action, 'LOAD_IMAGE_SUCCEEDED')) {
      return next(action);
    } else {
      const { id: imageId } = action.payload;
      // The stored scale is a zoom factor on top of the fit-to-canvas scale
      // (computed at render time in TracingViewer/connected, so it can track
      // layout changes). A freshly loaded image starts at 1 = exactly fitted.
      dispatch(setScale({ imageId, scale: 1 }));
      return next(action);
    }
  };

export default middleware as Middleware;
