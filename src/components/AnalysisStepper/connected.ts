import {
  connect,
} from 'react-redux';
import noop from 'lodash/noop';
import AnalysisStepper from './index';
import {
  StateProps,
  OwnProps,
  Props,
} from './props';
import {
  getStepState,
  getCalculatedValue,
  getActiveAnalysisSteps,
  isStepSkippable,
  isStepRemovable,
} from 'store/reducers/workspace/analyses';
import {
  getHighlightedStep,
} from 'store/reducers/workspace/canvas';
import {
  getActiveTracingImageId,
} from 'store/reducers/workspace';
import {
  getAnalysisId,
  getScaleFactor,
} from 'store/reducers/workspace/image';
import { getNameForAnalysis } from 'components/AnalysisSelector/strings';

import {
  removeManualLandmark,
  highlightStep,
  unhighlightStep,
} from 'actions/workspace';

// The active tracing image id is threaded through to mergeProps so the
// landmark actions carry the {imageId} their payloads require.
type StateFromStore = StateProps & { imageId: string };

const mapStateToProps = (state: StoreState): StateFromStore => {
  const imageId = getActiveTracingImageId(state)!;
  const analysisId = imageId !== null ? getAnalysisId(state)(imageId) : null;
  return {
    analysisName: analysisId !== null ? getNameForAnalysis(analysisId) : null,
    steps: getActiveAnalysisSteps(state)(imageId),
    getStepState: getStepState(state)(imageId),
    getStepValue: getCalculatedValue(state)(imageId),
    isCalibrated: imageId !== null && getScaleFactor(state)(imageId) !== null,
    highlightedStep: getHighlightedStep(state),
    isStepRemovable,
    isStepSkippable,
    imageId,
  };
};

const mapDispatchToProps = (dispatch: GenericDispatch) => ({ dispatch });

const mergeProps = (
  stateProps: StateFromStore,
  { dispatch }: { dispatch: GenericDispatch },
  ownProps: OwnProps,
): Props => {
  const { imageId, ...rest } = stateProps;
  return {
    ...rest,
    ...ownProps,
    onRemoveLandmarkClick: ({ symbol }: CephLandmark) =>
      dispatch(removeManualLandmark({ imageId, symbol })),
    onEditLandmarkClick: noop, // @TODO
    onStepMouseEnter: ({ symbol }: CephLandmark) => dispatch(highlightStep({ symbol })),
    onStepMouseLeave: (_: CephLandmark) => dispatch(unhighlightStep(void 0)),
  };
};

const connected = connect(mapStateToProps, mapDispatchToProps, mergeProps)(AnalysisStepper);

export default connected;
