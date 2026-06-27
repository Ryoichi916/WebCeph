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
} from 'store/reducers/workspace/image';

import {
  getCanvasDimensions
} from 'store/reducers/workspace/canvas';

import {
  getScale,
  getActiveTool,
} from 'store/reducers/workspace/canvas';

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

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState, { imageId }: OwnProps) => {
    return {
      canvasSize: getCanvasDimensions(state),
      src: getImageSrc(state)(imageId),
      imageWidth: 200,
      imageHeight: 200,
      // imageWidth: getImageWidth(state) as number,
      // imageHeight: getImageHeight(state) as number,
      scale: getScale(state),
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
    };
  };

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> =
  (dispatch) => ({ dispatch });

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(TracingViewer);


export default connected;
