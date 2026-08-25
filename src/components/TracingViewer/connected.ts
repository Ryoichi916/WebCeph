import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';

import TracingViewer from './index';

import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';

import {
  getImageSrc,
  getImageWidth,
  getImageHeight,
  getManualLandmarks,
} from 'store/reducers/workspace/image';

import { addManualLandmark, moveManualLandmarkLive } from 'actions/workspace';

import {
  getCanvasDimensions
} from 'store/reducers/workspace/canvas';

import {
  getScale,
  getActiveTool,
  isProfilogramShown,
  getFitScale,
  getEffectiveOffset,
} from 'store/reducers/workspace/canvas';

import { buildProfilogram } from 'analyses/profilogram';

// Stable empty array so an off profilogram doesn't re-render on every state change.
const EMPTY_PROFILOGRAM: never[] = [];

import {
  getHighlightedLandmarks,
  getSortedLandmarksToDisplay,
  getLandmarksToDisplay,
  getActiveTracingImageId,
  isHighlightMode,
} from 'store/reducers/workspace';

import * as cx from 'classnames';

const classes = require('./style.scss');
import isReferencePlaneSymbol from './planes';
import { createSelector } from 'reselect';

import {
  isGeoAngle,
  isGeoPoint,
  isGeoVector,
} from 'utils/math';

const EMPTY_ARRAY: string[] = [];

const getHighlightClassNames = createSelector(
  isHighlightMode,
  getHighlightedLandmarks,
  (isHighlight, highlighted) => memoize((symbol: string): string[] => {
    if (isHighlight) {
      if (highlighted[symbol]) {
        return [classes.highlighted];
      } else {
        return [classes.landmark_unhighlighted];
      }
    }
    return EMPTY_ARRAY;
  }),
);

import memoize from 'lodash/memoize';

const getPropsForLandmark = createSelector(
  getHighlightClassNames,
  getLandmarksToDisplay,
  getActiveTracingImageId,
  (getHighlightClassNames, toDisplay, imageId) => memoize((symbol: string) => {
    // The rendered landmark props are a loose bag (see StateProps), since a
    // point/vector/angle each contribute a different subset.
    const props: { [prop: string]: any } = {
      className: undefined,
    };

    const classNames: string[] = [];

    const l = imageId !== null ? toDisplay(imageId)[symbol] : undefined;
    if (isGeoPoint(l)) {
      classNames.push(classes.point);
      props.r = 4;
    } else if (isGeoVector(l)) {
      // Reference planes (S-N, Frankfort, Go-Me, facial plane…) get the
      // heavier stroke; construction/measurement segments stay light.
      classNames.push(
        isReferencePlaneSymbol(symbol) ? classes.vector_plane : classes.vector,
      );
    } else if (isGeoAngle(l)) {
      classNames.push(classes.angle);
      props.segmentProps = {
        className: cx(classes.vector_segment, ...getHighlightClassNames(symbol)),
      };
      props.parallelProps = {
        className: cx(classes.vector_parallel, ...getHighlightClassNames(symbol)),
      };
      props.extendedProps = {
        className: cx(classes.vector_extended, ...getHighlightClassNames(symbol)),
      };
      props.angleIndicatorProps = {
        className: cx(classes.angle_indicator, ...getHighlightClassNames(symbol)),
        r: '2.5cm',
      };
    }

    props.className = cx(...classNames, ...getHighlightClassNames(symbol));

    return props;
  }),
);

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState, { imageId }: OwnProps) => {
    const canvasSize = getCanvasDimensions(state);
    const imageWidth = getImageWidth(state)(imageId) as number;
    const imageHeight = getImageHeight(state)(imageId) as number;
    return {
      canvasSize,
      src: getImageSrc(state)(imageId),
      imageWidth,
      imageHeight,
      // The stored scale is the user's zoom factor (1 = fit, wheel-adjusted).
      scale: getFitScale(canvasSize, imageWidth, imageHeight) * getScale(state),
      // Where the (scaled) image is drawn within the canvas — cursor-anchored
      // pan/zoom offset if one has been set, else centered. @see
      // store/reducers/workspace/canvas#getEffectiveOffset
      offset: getEffectiveOffset(state)(imageId),
      landmarks: getSortedLandmarksToDisplay(state),
      isHighlightMode: isHighlightMode(state),
      highlightedLandmarks: getHighlightedLandmarks(state),
      activeTool: getActiveTool(state),
      getPropsForLandmark: getPropsForLandmark(state),
      isDraggableLandmark: (symbol: string) =>
        getManualLandmarks(state)(imageId)[symbol] !== undefined,
      profilogram: isProfilogramShown(state)
        ? buildProfilogram(getManualLandmarks(state)(imageId))
        : EMPTY_PROFILOGRAM,
    };
  };

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> =
  (dispatch, { imageId }) => ({
    dispatch,
    onLandmarkMoved: (symbol: string, x: number, y: number) =>
      dispatch(addManualLandmark({ imageId, symbol, value: { x, y } })),
    onLandmarkDragged: (symbol: string, x: number, y: number) =>
      dispatch(moveManualLandmarkLive({ imageId, symbol, value: { x, y } })),
  });

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(TracingViewer);


export default connected;
