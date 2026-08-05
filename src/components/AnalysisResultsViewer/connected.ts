import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';
import AnalysisResultsViewer from './index';
import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';
import {
  getCategorizedAnalysisResults,
  getActiveAnalysis,
} from 'store/reducers/workspace/analyses';

import {
  getActiveImageId,
  getAnalysisId,
} from 'store/reducers/workspace/image';

import {
  toggleAnalysisResults,
} from 'actions/workspace';

import map from 'lodash/map';
import keyBy from 'lodash/keyBy';

const EMPTY_LANDMARKS: StateProps['landmarksBySymbol'] = { };

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> = (state: StoreState) => {
  const activeImageId = getActiveImageId(state);
  if (activeImageId === null) {
    return {
      results: [],
      analysisId: null,
      landmarksBySymbol: EMPTY_LANDMARKS,
    };
  }
  const analysis = getActiveAnalysis(state)(activeImageId);
  return {
    results: getCategorizedAnalysisResults(state)(activeImageId),
    analysisId: getAnalysisId(state)(activeImageId),
    landmarksBySymbol: analysis !== null
      ? keyBy(map(analysis.components, c => c.landmark), l => l.symbol)
      : EMPTY_LANDMARKS,
  };
};

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> = (dispatch) => (
  {
    onRequestClose: () => dispatch(toggleAnalysisResults(void 0)),
  }
);

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(AnalysisResultsViewer);


export default connected;
