import { Store, Middleware } from 'redux';

import { isActionOfType } from 'utils/store';
import { addManualLandmarks } from 'actions/workspace';
import {
  getImageProps,
  getManualLandmarks,
} from 'store/reducers/workspace/image';
import { getManualSteps } from 'store/reducers/workspace/analyses';
import { isGeoPoint } from 'utils/math';
import { positionFromReferences } from 'analyses/referenceTemplate';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Scaffolds a tracing from the two reference points: on
 * PLOT_FROM_REFERENCE_POINTS_REQUESTED, reads the placed Sella (S) and Nasion
 * (N) and fills every other manual landmark of the active analysis at its
 * SN-relative population-mean position, as a single undoable batch. Landmarks
 * the reader has already placed are left untouched so re-running never clobbers
 * hand-tuned points.
 */
const middleware = ({ getState, dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => (action: GenericAction) => {
    if (!isActionOfType(action, 'PLOT_FROM_REFERENCE_POINTS_REQUESTED')) {
      return next(action);
    }
    next(action);

    const state = getState();
    const { imageId } = action.payload;

    const placed = getManualLandmarks(state)(imageId);
    const sella = placed['S'];
    const nasion = placed['N'];
    if (!isGeoPoint(sella) || !isGeoPoint(nasion)) {
      return;
    }

    const props = getImageProps(state)(imageId);
    const width = (props && props.width) || Infinity;
    const height = (props && props.height) || Infinity;

    const landmarks: { [symbol: string]: { x: number; y: number } } = {};
    getManualSteps(state)(imageId).forEach((step) => {
      const symbol = step.symbol;
      if (symbol === 'S' || symbol === 'N' || placed[symbol] !== undefined) {
        return;
      }
      const point = positionFromReferences(sella, nasion, symbol);
      if (point !== null) {
        landmarks[symbol] = {
          x: clamp(Math.round(point.x), 0, width),
          y: clamp(Math.round(point.y), 0, height),
        };
      }
    });

    if (Object.keys(landmarks).length > 0) {
      dispatch(addManualLandmarks({ imageId, landmarks }));
    }
  };

export default middleware as Middleware;
