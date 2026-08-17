import { createSelector } from 'reselect';
import canvas, { getHighlightedStep } from './canvas';
import analyses, {
  getMappedValue,
  getAllGeoObjects,
  findStepBySymbol,
  getManualSteps,
} from './analyses';
import treatment from './treatment';
import records from './records';
import image, {
  hasImage, getManualLandmarks,
  isAnyImageLoading,
  getImageName,
  getAllImages,
  getAllImagesStatus,
  getImageProps,
  getImageType,
  getImageTimepoint,
  getImageCaptureDate,
  isImageTraceable,
  getAnalysisId,
} from './image';
import settings, {
  getWorkspaceImageIds, getWorkspaceMode, getTracingImageId,
  isImporting, getImportError,
} from './settings';
import fileExport, {
  isExportingFile,
  getFileExportProgress,
  getExportedFileName,
  getFileExportError,
} from './fileExport';
import workers from './workers';
import order from './order';
import activeId, { getActiveWorkspaceId } from './activeId';
import { getWorkspacesIdsInOrder } from './order';

import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import sortBy from 'lodash/sortBy';
import mapValues from 'lodash/mapValues';
import every from 'lodash/every';
import last from 'lodash/last';

import { getCaptureDateSortKey, reconcilePhotoView } from 'utils/records';
import { isGeoPoint } from 'utils/math';

export default {
  ...analyses,
  ...image,
  ...canvas,
  ...workers,
  ...treatment,
  ...records,
  ...settings,
  ...fileExport,
  ...order,
  ...activeId,
};

export const canEdit = hasImage;

export const getActiveTracingImageId = createSelector(
  getTracingImageId,
  getActiveWorkspaceId,
  (getImageId, workspaceId) => getImageId(workspaceId!),
);

export const getHighlightedLandmarks = createSelector(
  getHighlightedStep,
  findStepBySymbol,
  getAllGeoObjects,
  getMappedValue,
  getActiveTracingImageId,
  (symbol, findStep, all, getMapped, imageId): { [symbol: string]: boolean } => {
    if (symbol === null || imageId === null) {
      return { };
    }
    const unhighlighted = mapValues(all(imageId), () => false);
    const step = findStep(imageId)(symbol, true);
    if (step !== null && typeof getMapped(imageId)(step) !== 'undefined') {
      return { ...unhighlighted, [step.symbol]: true };
    }
    return unhighlighted;
  },
);

export const getLandmarksToDisplay = getAllGeoObjects;

export const isHighlightMode = createSelector(
  getHighlightedLandmarks,
  (highlightedLandmarks) => !isEmpty(highlightedLandmarks),
);

export const isManualObject = createSelector(
  getManualLandmarks,
  getActiveTracingImageId,
  (getManual, imageId) => (symbol: string) =>
    imageId !== null && getManual(imageId)[symbol] !== undefined,
);

export const isHighlightedObject = createSelector(
  getHighlightedLandmarks,
  (highlighted) => (symbol: string) => highlighted[symbol] === true,
);

export const getSortedLandmarksToDisplay = createSelector(
  isManualObject,
  isHighlightedObject,
  getLandmarksToDisplay,
  getActiveTracingImageId,
  (isManual, isHighlighted, landmarksToDisplay, imageId) => {
    return sortBy(
      map(
        imageId !== null ? landmarksToDisplay(imageId) : {},
        (value: GeoObject, symbol: string) => ({ label: symbol, symbol, value }),
      ),
      ({ symbol }) => (
        isManual(symbol) || isHighlighted(symbol)
      ),
    );
  },
);

// Undo/redo history of the tracing slice; maintained by the enableUndoRedo
// reducer enhancer (see store/index.ts).
export const canUndo = (state: StoreState) =>
  (state['history.past'] || []).length > 0;
export const canRedo = (state: StoreState) =>
  (state['history.future'] || []).length > 0;

// The user has work worth exporting once the active tracing has any manually
// placed landmark.
export const hasUnsavedWork = createSelector(
  getManualLandmarks,
  getActiveTracingImageId,
  (getManual, imageId) => imageId !== null && !isEmpty(getManual(imageId)),
);

/**
 * Whether a case file is being written at this moment.
 *
 * Read off the export's own state (@see store/reducers/workspace/fileExport),
 * not off the active workspace's settings: an export is the whole chart, and the
 * `WorkspaceSettings.isExporting` this used to read was written by no reducer at
 * all — so the toolbar's spinner and the dialog's "Writing…" were unreachable
 * and a failure was silent.
 */
export const isExporting = isExportingFile;

export {
  getFileExportProgress,
  getExportedFileName,
  getFileExportError,
};

/**
 * Whether a file is being read into the rail tile the app is looking at, and why
 * the last one failed — the two the case-file dialog waits on before it closes.
 *
 * The dialog aims its import at the tile it made active a tick earlier (see
 * components/CaseFile/connected#onImport), so the *active* workspace is the one
 * the file is landing in.
 */
export const isImportingIntoActiveWorkspace = createSelector(
  isImporting,
  getActiveWorkspaceId,
  (getIsImporting, workspaceId) =>
    workspaceId !== null ? getIsImporting(workspaceId) === true : false,
);

export const getActiveWorkspaceImportError = createSelector(
  getImportError,
  getActiveWorkspaceId,
  (getError, workspaceId) =>
    workspaceId !== null ? getError(workspaceId) : null,
);

export { getWorkspaceImageIds };

export const getActiveWorkspaceMode = createSelector(
  getWorkspaceMode,
  getActiveWorkspaceId,
  (getMode, workspaceId) => getMode(workspaceId!),
);

export const getActiveWorkspaceImageIds = createSelector(
  getWorkspaceImageIds,
  getActiveWorkspaceId,
  (getImages, workspaceId) => getImages(workspaceId!),
);

export const shouldShowLoadingFileIndicator = createSelector(
  getWorkspaceImageIds,
  isImporting,
  isAnyImageLoading,
  (getIds, isFileImporting, isAnyLoading) => (workspaceId: string) => {
    return (
      isFileImporting(workspaceId) && !(isAnyLoading(getIds(workspaceId)))
    );
  },
);

export const hasMultipleWorkspaces = createSelector(
  getWorkspacesIdsInOrder,
  (workspaces) => workspaces.length > 1,
);

export const doesWorkspaceHaveImages = createSelector(
  getWorkspaceImageIds,
  (getImages) => (workspaceId: string) => getImages(workspaceId).length > 0,
);
export const isWorkspaceUsed = doesWorkspaceHaveImages;

export const areAllWorkspacesUsed = createSelector(
  isWorkspaceUsed,
  getWorkspacesIdsInOrder,
  (isUsed, workspaces) => every(workspaces, isUsed),
);

export const getLastWorkspaceId = createSelector(
  getWorkspacesIdsInOrder,
  (workspaces) => last(workspaces) || null,
);

export const isLastWorkspaceUsed = createSelector(
  isWorkspaceUsed,
  getLastWorkspaceId,
  (isUsed, lastWorkspace) => lastWorkspace !== null ? isUsed(lastWorkspace) : true,
);

export const getWorkspaceTitle = createSelector(
  getWorkspaceMode,
  getWorkspaceImageIds,
  getTracingImageId,
  getImageName,
  (getMode, getImages, getTracingImage, getName) => (workspaceId: string) => {
    const mode = getMode(workspaceId);
    if (mode === 'tracing') {
      const tracingImage = getTracingImage(workspaceId);
      return tracingImage !== null ? getName(tracingImage) : null;
    } else {
      const images = getImages(workspaceId);
      return getName(images[0]);
    }
  },
);

export const getActiveWorkspaceTitle = createSelector(
  getActiveWorkspaceId,
  getWorkspaceTitle,
  (id, getTitle) => id !== null ? getTitle(id) : null,
);

// ---- Patient records -------------------------------------------------------

/**
 * One image of the open patient's record, as the dashboard and the image rail
 * need it. Every field is read off existing state — nothing here is inferred
 * or fabricated: a missing timepoint stays null rather than becoming "T1".
 */
export interface PatientRecord {
  imageId: string;
  /** The workspace (rail tile) this image lives in — where to open it. */
  workspaceId: string;
  /** Original file name, if known. */
  name: string | null;
  /** Data URI of the image, used as the card/tile thumbnail. */
  thumbnail: string | null;
  type: ImageType | null;
  timepoint: string | null;
  /** ISO `YYYY-MM-DD`, or null when the capture date was not recorded. */
  captureDate: string | null;
  /**
   * Which frame of the photographic series this photograph is, or null — null on
   * every radiograph, and on a photograph whose frame the record does not state.
   * What places a photograph in the visit's composite series tile; never inferred
   * from the type. @see PhotoView
   */
  photoView: PhotoView | null;
  /** Whether this image type supports cephalometric tracing. */
  isTraceable: boolean;
  /** Active analysis id for this image (null for non-traceable types). */
  analysisId: string | null;
  /** Manual landmarks already placed for the active analysis. */
  landmarksPlaced: number;
  /** Manual landmarks the active analysis requires in total. */
  landmarksRequired: number;
  /**
   * Every manual landmark actually stored for this image, in the image's own
   * pixel coordinates — the tracing as it exists, not a count of it. The
   * records dashboard plots these over the card's thumbnail so a worked-up film
   * is identifiable at a glance instead of reading as the same near-black
   * rectangle as an untraced one. Empty for an image with nothing plotted.
   */
  landmarkPoints: GeoPoint[];
  /** Whether the image carries a mm/px calibration. */
  isCalibrated: boolean;
  /** mm per pixel, or null when the image has never been calibrated. */
  scaleFactor: number | null;
  /**
   * The film this one's scale was **copied from**, or null when it was measured on
   * this film.
   *
   * A calibration a clinician marked against a ruler and a calibration carried
   * over from a sibling film are not the same claim, and on a record a practice
   * keeps for years the difference is chart integrity: without it, T2's card read
   * "SCALE 0.25 mm/px" exactly as T1's did, and nothing on screen or on the printed
   * sheet said which of the two had ever been measured. It is also what lets the
   * batched reversal be derived from the record rather than remembered by a
   * component (see `RecordsDashboard#appliedFrom`).
   */
  scaleSourceId: string | null;
  /** Natural pixel dimensions of the file, or null when not yet known. */
  width: number | null;
  height: number | null;
  /** Whether this is the image currently open in the editor. */
  isActive: boolean;
}

/**
 * Every loaded image of the open patient, newest-dated last, as records.
 * Images with no capture date sort after the dated ones (see
 * utils/records#getCaptureDateSortKey) instead of masquerading as the oldest.
 */
export const getPatientRecords = createSelector(
  getAllImages,
  getAllImagesStatus,
  getImageProps,
  getWorkspacesIdsInOrder,
  getWorkspaceImageIds,
  getTracingImageId,
  getImageType,
  getImageTimepoint,
  getImageCaptureDate,
  isImageTraceable,
  getAnalysisId,
  getManualSteps,
  getManualLandmarks,
  getActiveTracingImageId,
  (
    allImages, allStatus, getProps, workspaceIds, getImagesOf, getTracingImage,
    getType, getTimepoint, getCaptureDate, isTraceable, getActiveAnalysisId,
    getSteps, getPlaced, activeImageId,
  ): PatientRecord[] => {
    // Only images that actually finished loading are records. Read the status
    // map directly rather than through isImageLoaded, which assumes an entry
    // exists for every image id.
    const isLoaded = (imageId: string): boolean => {
      const status = allStatus[imageId];
      return status !== undefined &&
        status.isLoading === false && status.error === null;
    };
    // Which rail tile (workspace) each image belongs to. The tracing image of
    // a workspace wins, so opening a record lands on the tab that shows it.
    const workspaceOfImage: { [imageId: string]: string } = {};
    workspaceIds.forEach((workspaceId) => {
      (getImagesOf(workspaceId) || []).forEach((imageId: string) => {
        if (workspaceOfImage[imageId] === undefined) {
          workspaceOfImage[imageId] = workspaceId;
        }
      });
      const tracingImageId = getTracingImage(workspaceId);
      if (tracingImageId !== null) {
        workspaceOfImage[tracingImageId] = workspaceId;
      }
    });

    const records = map(
      Object.keys(allImages).filter((imageId) => isLoaded(imageId)),
      (imageId): PatientRecord => {
        const props = getProps(imageId);
        const analysisId = getActiveAnalysisId(imageId);
        const placed = getPlaced(imageId);
        const steps = analysisId !== null ? getSteps(imageId) : [];
        return {
          imageId,
          workspaceId: workspaceOfImage[imageId] || workspaceIds[0],
          name: (props && props.name) || null,
          thumbnail: (props && props.data) || null,
          type: getType(imageId),
          timepoint: getTimepoint(imageId),
          captureDate: getCaptureDate(imageId),
          // Read off the props this row already holds, through the same
          // reconciliation the store's own selector applies: a position that does
          // not belong to the stored type is *no* position, never a translated
          // one. (Not a 15th input selector: reselect's typings stop resolving
          // `createSelector` past fourteen, and the whole record row then typed
          // as `any`.)
          photoView: props !== undefined
            ? reconcilePhotoView(props.type, props.photoView) : null,
          isTraceable: isTraceable(imageId),
          analysisId,
          landmarksPlaced: steps.filter(
            ({ symbol }) => placed[symbol] !== undefined,
          ).length,
          landmarksRequired: steps.length,
          // The stored tracing itself. Only real `GeoPoint`s are taken — a
          // vector or an angle under a landmark's symbol is geometry computed
          // *from* points, and plotting it as one would be an invented dot.
          landmarkPoints: Object.keys(placed)
            .map((symbol) => placed[symbol])
            .filter(isGeoPoint),
          isCalibrated: props !== undefined && typeof props.scaleFactor === 'number',
          scaleFactor: (props && typeof props.scaleFactor === 'number')
            ? props.scaleFactor
            : null,
          scaleSourceId: (props && typeof props.scaleSourceId === 'string')
            ? props.scaleSourceId
            : null,
          width: (props && props.width) || null,
          height: (props && props.height) || null,
          isActive: imageId === activeImageId,
        };
      },
    );

    return sortBy(
      records,
      ({ captureDate }) => getCaptureDateSortKey(captureDate),
      ({ timepoint }) => timepoint || '',
    );
  },
);
