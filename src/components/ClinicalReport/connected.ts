import { connect } from 'react-redux';

import ClinicalReport from './index';
import { StateProps, OwnProps } from './props';

import {
  getCategorizedAnalysisResults,
  getActiveAnalysis,
} from 'store/reducers/workspace/analyses';
import {
  getAnalysisId,
  getImageProps,
  getManualLandmarks,
  getScaleFactor,
} from 'store/reducers/workspace/image';
import { getActivePatient } from 'store/reducers/patients';

import map from 'lodash/map';
import keyBy from 'lodash/keyBy';

const EMPTY_LANDMARKS: StateProps['landmarksBySymbol'] = { };
const EMPTY_MANUAL: StateProps['manualLandmarks'] = { };

const mapStateToProps =
  (state: StoreState, { imageId }: OwnProps): StateProps => {
    if (imageId === null) {
      return {
        patient: getActivePatient(state),
        results: [],
        analysisId: null,
        landmarksBySymbol: EMPTY_LANDMARKS,
        imageSrc: null,
        imageWidth: null,
        imageHeight: null,
        imageType: null,
        manualLandmarks: EMPTY_MANUAL,
        scaleFactor: null,
      };
    }
    const analysis = getActiveAnalysis(state)(imageId);
    const image = getImageProps(state)(imageId);
    return {
      patient: getActivePatient(state),
      results: getCategorizedAnalysisResults(state)(imageId),
      analysisId: getAnalysisId(state)(imageId),
      landmarksBySymbol: analysis !== null
        ? keyBy(map(analysis.components, c => c.landmark), l => l.symbol)
        : EMPTY_LANDMARKS,
      imageSrc: (image && image.data) || null,
      imageWidth: (image && image.width) || null,
      imageHeight: (image && image.height) || null,
      imageType: (image && image.type) || null,
      manualLandmarks: getManualLandmarks(state)(imageId),
      scaleFactor: getScaleFactor(state)(imageId),
    };
  };

export default connect(mapStateToProps)(ClinicalReport);
