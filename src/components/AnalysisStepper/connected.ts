import {
  connect,
} from 'react-redux';
import noop from 'lodash/noop';
import findIndex from 'lodash/findIndex';
import AnalysisStepper from './index';
import { areEqualSteps } from 'analyses/helpers';
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
  isStepValuePendingScale,
} from 'store/reducers/workspace/analyses';
import {
  getHighlightedStep,
} from 'store/reducers/workspace/canvas';
import {
  getActiveTracingImageId,
} from 'store/reducers/workspace';
import {
  getAnalysisId,
} from 'store/reducers/workspace/image';
import { getNameForAnalysis } from 'components/AnalysisSelector/strings';

import {
  removeManualLandmark,
  highlightStep,
  unhighlightStep,
} from 'actions/workspace';

/**
 * One physical line, one drawing act on the checklist.
 *
 * The step list keeps *directed* line landmarks apart on purpose — signed
 * angles need Go→Me and Me→Go as distinct vectors — but to the person tracing
 * the film they are the same stroke, and most analyses surfaced the same line
 * twice: reversed-endpoint pairs (`Go-Me` beside `Me-Go`, `S-Ar` beside
 * `Ar-S`) and aliases (`Or-Po` beside `Frankfort Horizontal Plane`,
 * `U1 Incisal Edge-U1 Apex` beside `Upper Incisor Axis`). Björk's stepper
 * counted 4 re-draws among its 18 rows.
 *
 * `areEqualSteps` already defines undirected equality (same type, same
 * components in either order), so a line whose components match an earlier
 * line's is collapsed into it — *display only*: every directed landmark stays
 * in the store's step list, so states, values, geometry and highlighting are
 * untouched. When the duplicate carries a clinical name and the first
 * occurrence is a bare symbol, the named variant is shown (at the first
 * occurrence's position): "Draw line Frankfort Horizontal Plane", never a
 * second "Draw line Or-Po".
 */
const collapseDuplicateLineSteps = (steps: CephLandmark[]): CephLandmark[] => {
  const collapsed: CephLandmark[] = [];
  for (const step of steps) {
    if (step.type === 'line') {
      const i = findIndex(
        collapsed,
        s => s.type === 'line' && areEqualSteps(s, step),
      );
      if (i !== -1) {
        if (typeof collapsed[i].name !== 'string' && typeof step.name === 'string') {
          collapsed[i] = step;
        }
        continue;
      }
    }
    collapsed.push(step);
  }
  return collapsed;
};

// The active tracing image id is threaded through to mergeProps so the
// landmark actions carry the {imageId} their payloads require.
type StateFromStore = StateProps & { imageId: string };

const mapStateToProps = (state: StoreState): StateFromStore => {
  const imageId = getActiveTracingImageId(state)!;
  const analysisId = imageId !== null ? getAnalysisId(state)(imageId) : null;
  return {
    analysisName: analysisId !== null ? getNameForAnalysis(analysisId) : null,
    steps: collapseDuplicateLineSteps(getActiveAnalysisSteps(state)(imageId)),
    getStepState: getStepState(state)(imageId),
    getStepValue: getCalculatedValue(state)(imageId),
    isStepValuePendingScale: isStepValuePendingScale(state)(imageId),
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
