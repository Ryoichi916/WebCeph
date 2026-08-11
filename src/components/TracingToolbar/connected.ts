import { connect } from 'react-redux';

import TracingToolbar from './index';
import { StateProps, DispatchProps, OwnProps } from './props';

import {
  autoPlotLandmarks,
  plotFromReferencePoints,
  toggleProfilogram,
  setActiveAnalysis,
  exportImage,
  toggleAnalysisResults,
  setScale,
  setScaleFactor,
  unsetScaleFactor,
  setImageProps,
  setActiveWorkspace,
  removeWorkspace,
  closeImage,
  undo,
  redo,
} from 'actions/workspace';
import {
  canUndo, canRedo, getPatientRecords, PatientRecord,
} from 'store/reducers/workspace';
import {
  getManualSteps,
  isSummaryShown,
  canShowSummary,
} from 'store/reducers/workspace/analyses';
import { isPerformingBackgroundWork } from 'store/reducers/workspace/workers';
import { isProfilogramShown, getScale } from 'store/reducers/workspace/canvas';
import {
  hasImage, getManualLandmarks, getAnalysisId, getScaleFactor,
} from 'store/reducers/workspace/image';
// Whether the patient has two registrable tracings — one source of truth,
// shared with the superimposition view itself.
import {
  getSuperimpositionAvailability,
} from 'components/Superimposition/selectors';
// Whether this tracing can carry a treatment simulation — the same pure
// readiness rule the simulation view itself uses to enable its controls.
import { getSimulationReadiness } from 'analyses/simulation';

const mapStateToProps =
  (state: StoreState, { imageId }: OwnProps): StateProps => {
    const manual = imageId !== null ? getManualLandmarks(state)(imageId) : {};
    const superimposition = getSuperimpositionAvailability(state);
    const scaleFactor = imageId !== null ? getScaleFactor(state)(imageId) : null;
    const simulation = getSimulationReadiness(manual, scaleFactor);
    const missingLandmarkCount = imageId !== null
      ? getManualSteps(state)(imageId)
          .filter(({ symbol }) => manual[symbol] === undefined).length
      : 0;
    // The record this image is, and the patient's other records: the toolbar's
    // record menu corrects or removes *this* film, and a removal needs another
    // tile to land on.
    const records = getPatientRecords(state);
    const record = records.filter((r) => r.imageId === imageId)[0];
    return {
      missingLandmarkCount,
      records,
      record: record !== undefined ? record : null,
      // Auto-plot needs an image and an analysis whose manual steps define which
      // landmarks to place. The active predictor (see predictors/index.ts) does
      // the plotting; results are injected as a single undoable batch that can
      // then be fine-tuned by hand.
      canAutoPlot:
        imageId !== null &&
        hasImage(state) &&
        getManualSteps(state)(imageId).length > 0,
      isAutoPlotting: isPerformingBackgroundWork(state),
      // Reference plotting scaffolds the rest of the tracing from the two
      // placed reference points, Sella and Nasion.
      canPlotFromReferences:
        imageId !== null &&
        manual['S'] !== undefined &&
        manual['N'] !== undefined,
      isProfilogramShown: isProfilogramShown(state),
      activeAnalysisId: imageId !== null ? getAnalysisId(state)(imageId) : null,
      canShowSummary:
        imageId !== null &&
        !isSummaryShown(state) &&
        canShowSummary(state)(imageId),
      zoom: getScale(state),
      canUndo: canUndo(state),
      canRedo: canRedo(state),
      scaleFactor,
      canSuperimpose: superimposition.canSuperimpose,
      superimposeReason: superimposition.reason,
      canSimulate: imageId !== null && simulation.canSimulate,
      simulateReason: simulation.reason,
    };
  };

const mapDispatchToProps =
  (dispatch: GenericDispatch, { imageId }: OwnProps): DispatchProps => ({
    onAutoPlotClick: () => {
      if (imageId !== null) {
        dispatch(autoPlotLandmarks({ imageId }));
      }
    },
    onPlotFromReferencesClick: () => {
      if (imageId !== null) {
        dispatch(plotFromReferencePoints({ imageId }));
      }
    },
    onToggleProfilogramClick: () => dispatch(toggleProfilogram()),
    onSelectAnalysis: (analysisId: string) => {
      if (imageId !== null) {
        dispatch(setActiveAnalysis({
          imageId,
          analysisId: analysisId as AnalysisId<ImageType>,
        }));
      }
    },
    onExportImage: (format: 'png' | 'jpeg') => {
      if (imageId !== null) {
        dispatch(exportImage({ imageId, format }));
      }
    },
    onShowSummaryClick: () => dispatch(toggleAnalysisResults(void 0)),
    onUndoClick: () => dispatch(undo(void 0)),
    onRedoClick: () => dispatch(redo(void 0)),
    onZoomChange: (scale: number) => {
      if (imageId !== null) {
        dispatch(setScale({ imageId, scale }));
      }
    },
    onSetScaleFactor: (value: number) => {
      if (imageId !== null) {
        dispatch(setScaleFactor({ imageId, value }));
      }
    },
    onUnsetScaleFactor: () => {
      if (imageId !== null) {
        dispatch(unsetScaleFactor({ imageId }));
      }
    },
    // Exactly the paths the records dashboard and the read-only record viewer
    // use — one data path per record action, whatever surface it is invoked from.
    onSaveRecordMeta: (meta: ImageRecordMeta) => {
      if (imageId !== null) {
        dispatch(setImageProps({
          id: imageId,
          type: meta.type,
          timepoint: meta.timepoint,
          captureDate: meta.captureDate,
        }));
      }
    },
    onRemoveRecord: (
      record: PatientRecord, fallbackWorkspaceId: string | null,
    ) => {
      dispatch(closeImage({
        imageId: record.imageId,
        workspaceId: record.workspaceId,
      }));
      if (fallbackWorkspaceId !== null) {
        dispatch(setActiveWorkspace({ id: fallbackWorkspaceId }));
        dispatch(removeWorkspace({
          id: record.workspaceId,
          removeUnreferencedImages: true,
        }));
      }
    },
  });

export default connect(mapStateToProps, mapDispatchToProps)(TracingToolbar);
