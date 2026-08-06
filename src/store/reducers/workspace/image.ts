import { handleActions } from 'utils/store';
import some from 'lodash/some';
import omit from 'lodash/omit';

import { createSelector } from 'reselect';

import { getTracingImageId } from './settings';
import { getActiveWorkspaceId } from './activeId';

const KEY_IMAGES: StoreKey = 'images.props';
const KEY_IMAGES_LOAD_STATUS: StoreKey = 'images.status';
const KEY_TRACING: StoreKey = 'images.tracing';

// Default props applied to a freshly loaded image, then overridden by any
// existing state and the action payload.
const defaultImageProps = {
  name: null as string | null,
  type: 'ceph_lateral' as ImageType,
  // Natural pixel dimensions of the loaded image; filled from the
  // LOAD_IMAGE_SUCCEEDED payload. Used to render the tracing canvas at the right
  // aspect ratio and to auto-fit the zoom.
  width: null as number | null,
  height: null as number | null,
  scaleFactor: null as number | null,
  flipX: false,
  flipY: false,
  brightness: 0.5,
  contrast: 0.5,
  invertColors: false,
  analysis: {
    // Default to a standard lateral-ceph analysis so manual plotting is usable
    // immediately on import: the stepper has steps and canvas clicks name the
    // expected landmarks. Without an active analysis, clicks fall back to the
    // (unimplemented) unnamed-landmark path and place nothing.
    activeId: 'downs' as AnalysisId<ImageType> | null,
  },
};

const imagesReducer = handleActions<typeof KEY_IMAGES>(
  {
    SET_IMAGE_PROPS: (state, { payload }) => {
      return {
        ...state,
        [payload.id]: {
          ...state[payload.id],
          ...payload,
        },
      };
    },
    LOAD_IMAGE_SUCCEEDED: (state, { payload }) => {
      return {
        ...state,
        [payload.id]: {
          ...defaultImageProps,
          ...state[payload.id],
          ...payload,
        },
      };
    },
    CLOSE_IMAGE_REQUESTED: (state, { payload: { imageId } }) => {
      return omit(state, imageId) as typeof state;
    },
    SET_ACTIVE_ANALYSIS_REQUESTED: (state, { payload: { imageId, analysisId } }) => {
      return {
        ...state,
        [imageId]: {
          ...state[imageId],
          analysis: {
            ...(state[imageId] && state[imageId].analysis),
            activeId: analysisId,
          },
        },
      };
    },
    SET_SCALE_FACTOR_REQUESTED: (state, { payload: { imageId, value } }) => {
      return {
        ...state,
        [imageId]: {
          ...state[imageId],
          scaleFactor: value,
        },
      };
    },
    UNSET_SCALE_FACTOR_REQUESTED: (state, { payload: { imageId } }) => {
      return {
        ...state,
        [imageId]: {
          ...state[imageId],
          scaleFactor: null,
        },
      };
    },
  },
  {},
);

const loadStatusReducer = handleActions<typeof KEY_IMAGES_LOAD_STATUS>({
  LOAD_IMAGE_FAILED: (state, { payload: { id, error } }) => {
    return {
      ...state,
      [id]: {
        isLoading: false,
        error,
      },
    };
  },
  LOAD_IMAGE_STARTED: (state, { payload: { imageId } }) => {
    return {
      ...state,
      [imageId]: {
        isLoading: true,
        error: null,
      },
    };
  },
  LOAD_IMAGE_SUCCEEDED: (state, { payload: { id } }) => {
    return {
      ...state,
      [id]: {
        isLoading: false,
        error: null,
      },
    };
  },
  CLOSE_IMAGE_REQUESTED: (state, { payload: { imageId } }) => {
    return omit(state, imageId) as typeof state;
  },
}, {});

const tracingReducer = handleActions<typeof KEY_TRACING>({
  SET_IMAGE_PROPS: (state, { payload: { id, tracing } }) => {
    if (tracing) {
      return {
        ...state,
        [id]: {
          ...state[id],
          ...tracing,
        },
      };
    }
    return state;
  },
  SET_TRACING_MODE_REQUESTED: (state, { payload: { imageId, mode } }) => {
    return {
      ...state,
      [imageId]: {
        ...state[imageId],
        mode,
      },
    };
  },
  ADD_MANUAL_LANDMARK_REQUESTED: (state, { payload }) => {
    const { imageId, symbol, value } = payload;
    const entry = state[imageId];
    return {
      ...state,
      [imageId]: {
        ...entry,
        manualLandmarks: {
          ...(entry && entry.manualLandmarks),
          [symbol]: value,
        },
      },
    };
  },
  ADD_MANUAL_LANDMARKS_BATCH_REQUESTED: (state, { payload }) => {
    const { imageId, landmarks } = payload;
    const entry = state[imageId];
    return {
      ...state,
      [imageId]: {
        ...entry,
        manualLandmarks: {
          ...(entry && entry.manualLandmarks),
          ...landmarks,
        },
      },
    };
  },
  REMOVE_MANUAL_LANDMARK_REQUESTED: (state, { payload }) => {
    const { imageId, symbol } = payload;
    const entry = state[imageId];
    return {
      ...state,
      [imageId]: {
        ...entry,
        manualLandmarks: {
          ...omit(entry && entry.manualLandmarks, symbol),
        },
      },
    };
  },
  SKIP_MANUAL_STEP_REQUESTED: (state, { payload: { imageId, step } }) => {
    const entry = state[imageId];
    return {
      ...state,
      [imageId]: {
        ...entry,
        skippedSteps: {
          ...(entry && entry.skippedSteps),
          [step]: true,
        },
      },
    };
  },
  UNSKIP_MANUAL_STEP_REQUESTED: (state, { payload: { imageId, step } }) => {
    const entry = state[imageId];
    return {
      ...state,
      [imageId]: {
        ...entry,
        skippedSteps: {
          ...omit(entry && entry.skippedSteps, step),
        },
      },
    };
  },
}, {});

const reducers: Partial<ReducerMap> = {
  [KEY_IMAGES_LOAD_STATUS]: loadStatusReducer,
  [KEY_IMAGES]: imagesReducer,
  [KEY_TRACING]: tracingReducer,
};

export default reducers;

export const getAllImages = (state: StoreState) => state[KEY_IMAGES];
export const getAllImagesStatus = (state: StoreState) => state[KEY_IMAGES_LOAD_STATUS];

export const getImageProps = createSelector(
  getAllImages,
  (all) => (imageId: string) => all[imageId],
);

export const getImageSrc = createSelector(
  getImageProps,
  (getProps) => (id: string) => getProps(id).data,
);

export const getImageWidth = createSelector(
  getImageProps,
  (getProps) => (id: string) => getProps(id).width,
);

export const getImageHeight = createSelector(
  getImageProps,
  (getProps) => (id: string) => getProps(id).height,
);

export const isImageFlippedX = createSelector(
  getImageProps,
  (getProps) => (id: string) => getProps(id).flipX,
);

export const getImageStatus = createSelector(
  getAllImagesStatus,
  (all) => (imageId: string) => all[imageId],
);

export const isImageLoading = createSelector(
  getImageStatus,
  (getStatus) => (imageId: string) => {
    const status = getStatus(imageId);
    return status.isLoading === true && status.error === null;
  },
);

export const isAnyImageLoading = createSelector(
  isImageLoading,
  (isLoading) => (ids: string[]) => some(ids, isLoading),
);

export const hasImageLoadFailed = createSelector(
  getImageStatus,
  (getStatus) => (id: string) => {
    const status = getStatus(id);
    return status.isLoading === false && status.error !== null;
  },
);

export const isImageLoaded = createSelector(
  getImageStatus,
  (getStatus) => (id: string) => {
    const status = getStatus(id);
    return status.isLoading === false && status.error === null;
  },
);

export const getImageName = createSelector(
  isImageLoaded,
  getImageProps,
  (isLoaded, getProps) => (id: string) => isLoaded(id) && getProps(id).name || null,
);

export const hasImage = createSelector(
  getAllImages,
  isImageLoaded,
  (all, isLoaded) => (
    some(all, (_, k: string) => isLoaded(k))
  ),
);

export const getAllTracingData = (state: StoreState) => state[KEY_TRACING];
export const getTracingDataByImageId = createSelector(
  getAllTracingData,
  (all) => (id: string) => all[id],
);

// Stable empty defaults so selectors stay referentially stable (reselect/memoize
// equality) for images that have no tracing entry yet — a tracing entry is only
// created lazily on the first manual landmark / skip.
const EMPTY_MANUAL_LANDMARKS = {};
const EMPTY_SKIPPED_STEPS = {};

export const getManualLandmarks = createSelector(
  getTracingDataByImageId,
  (getTracing) => (id: string) => {
    const tracing = getTracing(id);
    return (tracing && tracing.manualLandmarks) || EMPTY_MANUAL_LANDMARKS;
  },
);

export const getSkippedSteps = createSelector(
  getTracingDataByImageId,
  (getTracing) => (id: string) => {
    const tracing = getTracing(id);
    return (tracing && tracing.skippedSteps) || EMPTY_SKIPPED_STEPS;
  },
);

export const getAnalysisId = createSelector(
  getImageProps,
  (getProps) => (id: string) => {
    const props = getProps(id);
    return props && props.analysis ? props.analysis.activeId : null;
  },
);

export const getScaleFactor = createSelector(
  getImageProps,
  (getProps) => (id: string): number | null => {
    const props = getProps(id);
    return (props && typeof props.scaleFactor === 'number') ? props.scaleFactor : null;
  },
);

// The id of the image being traced in the active workspace. Used by the editor
// tools and lens, which always operate on the active tracing image.
export const getActiveImageId = (state: StoreState) =>
  getTracingImageId(state)(getActiveWorkspaceId(state)!);
