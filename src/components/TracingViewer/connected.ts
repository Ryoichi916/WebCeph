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

import { addManualLandmark } from 'actions/workspace';

import {
  getCanvasDimensions
} from 'store/reducers/workspace/canvas';

import {
  getScale,
  getActiveTool,
  isProfilogramShown,
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
      props.r = '0.5rem';
    } else if (isGeoVector(l)) {
      classNames.push(classes.vector);
    } else if (isGeoAngle(l)) {
      classNames.push(classes.angle);
      props.segmentProps = {
        className: cx(classes.vector, ...getHighlightClassNames(symbol)),
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

// Scale that letterboxes the image into the canvas. Computed at render time so
// it always reflects the current layout, instead of a one-shot value captured
// at load time (which races with layout).
const getFitScale = (
  canvas: { width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): number => {
  if (canvas.width > 0 && canvas.height > 0 && imageWidth > 0 && imageHeight > 0) {
    return Math.min(canvas.width / imageWidth, canvas.height / imageHeight);
  }
  return 1;
};

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
      // brightness: getImageBrightness(state),
      // contrast: getImageContrast(state),
      // isFlippedX: isImageFlippedX(state),
      // isFlippedY: isImageFlippedY(state),
      landmarks: getSortedLandmarksToDisplay(state),
      // isInverted: isImageInverted(state),
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
  });

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(TracingViewer);


export default connected;
