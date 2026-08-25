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
  hasUnreportableLinearMeasurements,
  getAnalysisCaveats,
  getPatientAnalysisContext,
} from 'store/reducers/workspace/analyses';

import {
  getActiveImageId,
  getAnalysisId,
  getImageTimepoint,
  getImageCaptureDate,
  getScaleFactor,
  getImageProps,
} from 'store/reducers/workspace/image';

import { isPlaceholderAutoPlotWarned } from 'store/reducers/workspace/predictorWarnings';

import {
  toggleAnalysisResults,
} from 'actions/workspace';

import map from 'lodash/map';
import keyBy from 'lodash/keyBy';

const EMPTY_LANDMARKS: StateProps['landmarksBySymbol'] = { };
const EMPTY_CAVEATS: AnalysisCaveat[] = [];
const EMPTY_CONTEXT: AnalysisContext = { };

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> = (state: StoreState) => {
  const activeImageId = getActiveImageId(state);
  if (activeImageId === null) {
    return {
      results: [],
      analysisId: null,
      provenance: null,
      timepoint: null,
      captureDate: null,
      landmarksBySymbol: EMPTY_LANDMARKS,
      needsScaleForLinear: false,
      scaleFactor: null,
      imageWidth: null,
      imageHeight: null,
      caveats: EMPTY_CAVEATS,
      analysisContext: EMPTY_CONTEXT,
      isPlaceholderAutoPlot: false,
    };
  }
  const analysis = getActiveAnalysis(state)(activeImageId);
  const imageProps = getImageProps(state)(activeImageId);
  return {
    scaleFactor: getScaleFactor(state)(activeImageId),
    imageWidth: (imageProps && imageProps.width) || null,
    imageHeight: (imageProps && imageProps.height) || null,
    results: getCategorizedAnalysisResults(state)(activeImageId),
    analysisId: getAnalysisId(state)(activeImageId),
    provenance: analysis !== null && analysis.provenance !== undefined
      ? analysis.provenance
      : null,
    timepoint: getImageTimepoint(state)(activeImageId),
    captureDate: getImageCaptureDate(state)(activeImageId),
    landmarksBySymbol: analysis !== null
      ? keyBy(map(analysis.components, c => c.landmark), l => l.symbol)
      : EMPTY_LANDMARKS,
    needsScaleForLinear: hasUnreportableLinearMeasurements(state)(activeImageId),
    caveats: getAnalysisCaveats(state)(activeImageId),
    analysisContext: getPatientAnalysisContext(state)(activeImageId),
    isPlaceholderAutoPlot: isPlaceholderAutoPlotWarned(state)(activeImageId),
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
