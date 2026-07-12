import { connect } from 'react-redux';

import TracingToolbar from './index';
import { StateProps, DispatchProps, OwnProps } from './props';

import { autoPlotLandmarks } from 'actions/workspace';
import { getManualSteps } from 'store/reducers/workspace/analyses';
import { isPerformingBackgroundWork } from 'store/reducers/workspace/workers';
import { hasImage } from 'store/reducers/workspace/image';

const mapStateToProps =
  (state: StoreState, { imageId }: OwnProps): StateProps => ({
    // Auto-plot needs an image and an analysis whose manual steps define which
    // landmarks to place. The active predictor (see predictors/index.ts) does
    // the plotting; results are injected as a single undoable batch that can
    // then be fine-tuned by hand.
    canAutoPlot:
      imageId !== null &&
      hasImage(state) &&
      getManualSteps(state)(imageId).length > 0,
    isAutoPlotting: isPerformingBackgroundWork(state),
  });

const mapDispatchToProps =
  (dispatch: GenericDispatch, { imageId }: OwnProps): DispatchProps => ({
    onAutoPlotClick: () => {
      if (imageId !== null) {
        dispatch(autoPlotLandmarks({ imageId }));
      }
    },
  });

export default connect(mapStateToProps, mapDispatchToProps)(TracingToolbar);
