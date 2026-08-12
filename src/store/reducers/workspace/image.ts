import { handleActions } from 'utils/store';
import some from 'lodash/some';
import omit from 'lodash/omit';

import { createSelector } from 'reselect';

import { getTracingImageId } from './settings';
import { getActiveWorkspaceId } from './activeId';

import { isTraceableImageType, reconcilePhotoView } from 'utils/records';

const KEY_IMAGES: StoreKey = 'images.props';
const KEY_IMAGES_LOAD_STATUS: StoreKey = 'images.status';
const KEY_TRACING: StoreKey = 'images.tracing';

// Default props applied to a freshly loaded image, then overridden by any
// existing state and the action payload.
const defaultImageProps = {
  name: null as string | null,
  type: 'ceph_lateral' as ImageType,
  // Records metadata (see utils/records). Null means "not recorded" — the
  // upload form supplies real values the user has seen, and nothing here
  // invents a timepoint or a capture date on the user's behalf.
  timepoint: null as string | null,
  captureDate: null as string | null,
  // Which frame of the photographic series a photograph is (see
  // utils/records#PHOTO_VIEW_OPTIONS). Null for every radiograph and for a
  // photograph whose frame was not stated — never inferred from the type.
  photoView: null as PhotoView | null,
  // Natural pixel dimensions of the loaded image; filled from the
  // LOAD_IMAGE_SUCCEEDED payload. Used to render the tracing canvas at the right
  // aspect ratio and to auto-fit the zoom.
  width: null as number | null,
  height: null as number | null,
  scaleFactor: null as number | null,
  // Where that scale came from, when it was not measured on this film: the
  // imageId it was copied from by the records dashboard's batched "apply this
  // scale to the record's other films". Null for a calibration marked on this
  // film — the only kind the tracing toolbar makes. @see SET_SCALE_FACTOR_REQUESTED
  scaleSourceId: null as string | null,
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

type ImageEntry = StoreState[typeof KEY_IMAGES][string];

/**
 * Keeps an image's active analysis consistent with its record type: only the
 * lateral cephalogram is traceable here, so a frontal ceph / panoramic /
 * photograph carries no active analysis. Without this, a photograph inherited
 * the lateral-ceph default and the stepper would offer to measure SNA on it.
 */
const reconcileAnalysisWithType = (entry: ImageEntry): ImageEntry => {
  if (isTraceableImageType(entry.type)) {
    // The reverse case: a film that was filed under the wrong type had its
    // analysis cleared. Correcting the type back to a lateral ceph (records
    // dashboard → Edit details) must hand it a usable analysis again, or the
    // stepper would open with no steps and canvas clicks would name nothing.
    if (entry.analysis && entry.analysis.activeId === null) {
      return {
        ...entry,
        analysis: {
          ...entry.analysis,
          activeId: defaultImageProps.analysis.activeId,
        },
      };
    }
    return entry;
  }
  if (entry.analysis && entry.analysis.activeId === null) {
    return entry;
  }
  return { ...entry, analysis: { ...entry.analysis, activeId: null } };
};

/**
 * Keeps a photograph's series position consistent with its type: a position
 * belongs to exactly one image type, so re-filing a photograph as a cephalogram —
 * or as a different kind of photograph — cannot leave "Right buccal" stored on it.
 *
 * It drops the position rather than translating it (see
 * `utils/records#reconcilePhotoView`): nothing knows which intraoral frame a
 * photograph re-filed from "Frontal photograph" is, so nothing claims one. The
 * record form writes the pair together, so this only ever fires on the paths that
 * write a type alone.
 */
const reconcileViewWithType = (entry: ImageEntry): ImageEntry => {
  const photoView = reconcilePhotoView(entry.type, entry.photoView);
  return photoView === entry.photoView ? entry : { ...entry, photoView };
};

const imagesReducer = handleActions<typeof KEY_IMAGES>(
  {
    SET_IMAGE_PROPS: (state, { payload }) => {
      return {
        ...state,
        [payload.id]: reconcileViewWithType(reconcileAnalysisWithType({
          ...state[payload.id],
          ...payload,
        } as ImageEntry)),
      };
    },
    LOAD_IMAGE_SUCCEEDED: (state, { payload }) => {
      return {
        ...state,
        [payload.id]: reconcileViewWithType(reconcileAnalysisWithType({
          ...defaultImageProps,
          ...state[payload.id],
          ...payload,
        } as ImageEntry)),
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
    SET_SCALE_FACTOR_REQUESTED: (
      state, { payload: { imageId, value, sourceImageId } },
    ) => {
      return {
        ...state,
        [imageId]: {
          ...state[imageId],
          scaleFactor: value,
          // Provenance travels with the number, and it is *replaced* by every
          // write: re-calibrating a film in the tracing editor dispatches this
          // action without a source, which is exactly what has happened — the
          // scale is now a measurement made on this film, so the record must stop
          // saying it was copied from another one.
          scaleSourceId: typeof sourceImageId === 'string' &&
            sourceImageId !== imageId
            ? sourceImageId : null,
        },
      };
    },
    UNSET_SCALE_FACTOR_REQUESTED: (state, { payload: { imageId } }) => {
      return {
        ...state,
        [imageId]: {
          ...state[imageId],
          scaleFactor: null,
          // No scale, nothing to have a provenance.
          scaleSourceId: null,
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

// ---- Records metadata ------------------------------------------------------

/** What kind of film/photograph this image is (see utils/records). */
export const getImageType = createSelector(
  getImageProps,
  (getProps) => (id: string): ImageType | null => {
    const props = getProps(id);
    return (props && props.type) || null;
  },
);

/** The image's treatment timepoint label (`T1`, `T2`, …), if recorded. */
export const getImageTimepoint = createSelector(
  getImageProps,
  (getProps) => (id: string): string | null => {
    const props = getProps(id);
    return (props && props.timepoint) || null;
  },
);

/** The image's ISO capture date, if recorded. */
export const getImageCaptureDate = createSelector(
  getImageProps,
  (getProps) => (id: string): string | null => {
    const props = getProps(id);
    return (props && props.captureDate) || null;
  },
);

/**
 * Which position of the photographic series this photograph is, or null.
 *
 * Read through `reconcilePhotoView`, so a stored position that does not belong to
 * the stored type is reported as *no* position rather than translated into one:
 * the pair is written together by the record form, and the one path that can put
 * them out of step (a legacy project, an older import, a surface that edits only
 * the type) must not have the record claim a frame nobody chose.
 */
export const getImagePhotoView = createSelector(
  getImageProps,
  (getProps) => (id: string): PhotoView | null => {
    const props = getProps(id);
    return props !== undefined
      ? reconcilePhotoView(props.type, props.photoView) : null;
  },
);

/**
 * Whether this image can be traced and analysed. The single predicate the
 * editor, the rail and the dashboard share, so a panoramic film is never
 * offered a cephalometric stepper.
 */
export const isImageTraceable = createSelector(
  getImageType,
  (getType) => (id: string): boolean => isTraceableImageType(getType(id)),
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

/**
 * The film this image's scale was copied from, or null when it was measured here.
 * @see SET_SCALE_FACTOR_REQUESTED
 */
export const getScaleSourceId = createSelector(
  getImageProps,
  (getProps) => (id: string): string | null => {
    const props = getProps(id);
    return (props && typeof props.scaleSourceId === 'string')
      ? props.scaleSourceId : null;
  },
);

/**
 * Whether the image carries a usable mm/px scale. Linear (mm) measurements are
 * only reportable in millimeters once it is set, so this is the single
 * predicate the analyses, the stepper, the summary and the printed report all
 * share when deciding whether to report or suppress them.
 */
export const hasScaleFactor = createSelector(
  getScaleFactor,
  (getScale) => (id: string): boolean => {
    const scaleFactor = getScale(id);
    return scaleFactor !== null && scaleFactor > 0;
  },
);

// The id of the image being traced in the active workspace. Used by the editor
// tools and lens, which always operate on the active tracing image.
export const getActiveImageId = (state: StoreState) =>
  getTracingImageId(state)(getActiveWorkspaceId(state)!);
