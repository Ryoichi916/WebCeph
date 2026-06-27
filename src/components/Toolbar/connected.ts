import {
  connect,
} from 'react-redux';
import { StateProps, OwnProps, Props } from './props';
import CephaloToolbar from './index';
import {
  setBrightness,
  setContrast,
  setActiveTool,
  flipX, flipY,
  invertColors,
  redo, undo,
  toggleAnalysisResults,
  exportFile,
  autoPlotLandmarks,
} from 'actions/workspace';
import {
  isSummaryShown,
  getManualSteps,
} from 'store/reducers/workspace/analyses';
import {
  isPerformingBackgroundWork,
} from 'store/reducers/workspace/workers';
import {
  canEdit,
  canRedo,
  canUndo,
  hasUnsavedWork,
  isExporting,
  getActiveTracingImageId,
} from 'store/reducers/workspace';
import {
  hasImage,
} from 'store/reducers/workspace/image';
import {
  getActiveToolId,
} from 'store/reducers/workspace/canvas';

import {
  canShowSummary,
} from 'store/reducers/workspace/analyses';

// The active image id is needed to bind the image-targeting actions; it is
// passed through to mergeProps and stripped from the final props.
type StateFromStore = StateProps & { activeImageId: string | null };

const mapStateToProps =
  (state: StoreState): StateFromStore => {
    const _isExporting = isExporting(state);
    const activeImageId = getActiveTracingImageId(state);
    return {
      activeToolId: getActiveToolId(state),
      brightness: 0.5,
      contrast: 0.5,
      isImageInverted: false,
      canEdit: canEdit(state),
      canRedo: canRedo(state),
      canUndo: canUndo(state),
      canShowSummary:
        activeImageId !== null &&
        !isSummaryShown(state) &&
        canShowSummary(state)(activeImageId),
      canExport: !_isExporting && hasImage(state) && hasUnsavedWork(state),
      isExporting: _isExporting,
      canAutoPlot:
        activeImageId !== null &&
        hasImage(state) &&
        getManualSteps(state)(activeImageId).length > 0,
      isAutoPlotting: isPerformingBackgroundWork(state),
      activeImageId,
    };
  };

const mapDispatchToProps = (dispatch: GenericDispatch) => ({ dispatch });

const mergeProps = (
  stateProps: StateFromStore,
  { dispatch }: { dispatch: GenericDispatch },
  ownProps: OwnProps,
): Props => {
  const { activeImageId, ...rest } = stateProps;
  const imageId = activeImageId !== null ? activeImageId : '';
  return {
    ...rest,
    ...ownProps,
    onBrightnessChange: (value: number) => dispatch(setBrightness({ imageId, value })),
    onContrastChange: (value: number) => dispatch(setContrast({ imageId, value })),
    onFlipXClick: () => dispatch(flipX({ imageId })),
    onFlipYClick: () => dispatch(flipY({ imageId })),
    onInvertToggle: () => dispatch(invertColors({ imageId })),
    onRedoClick: () => dispatch(redo(void 0)),
    onUndoClick: () => dispatch(undo(void 0)),
    onToolButtonClick: (id: ToolId) => dispatch(setActiveTool(id)),
    onAutoPlotClick: () => dispatch(autoPlotLandmarks({ imageId })),
    onShowSummaryClick: () => dispatch(toggleAnalysisResults(void 0)),
    onExportClick: () => dispatch(
      exportFile({
        format: 'wceph_v1',
      }),
    ),
  };
};

export default connect(mapStateToProps, mapDispatchToProps, mergeProps)(CephaloToolbar);
