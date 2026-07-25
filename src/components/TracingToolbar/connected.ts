import { connect } from 'react-redux';

import TracingToolbar from './index';
import { StateProps, DispatchProps, OwnProps } from './props';

import {
  autoPlotLandmarks,
  plotFromReferencePoints,
} from 'actions/workspace';
import { getManualSteps } from 'store/reducers/workspace/analyses';
import { isPerformingBackgroundWork } from 'store/reducers/workspace/workers';
import { hasImage, getManualLandmarks } from 'store/reducers/workspace/image';

const mapStateToProps =
  (state: StoreState, { imageId }: OwnProps): StateProps => {
    const manual = imageId !== null ? getManualLandmarks(state)(imageId) : {};
    return {
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
  });

export default connect(mapStateToProps, mapDispatchToProps)(TracingToolbar);
