import { connect } from 'react-redux';

import ClinicalReport from './index';
import { StateProps, DispatchProps, OwnProps } from './props';

import { autoPlotLandmarks } from 'actions/workspace';

import {
  getCategorizedAnalysisResults,
  getActiveAnalysis,
  hasUnreportableLinearMeasurements,
} from 'store/reducers/workspace/analyses';
import {
  getAnalysisId,
  getImageProps,
  getManualLandmarks,
  getScaleFactor,
  getImageTimepoint,
  getImageCaptureDate,
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
        timepoint: null,
        captureDate: null,
        manualLandmarks: EMPTY_MANUAL,
        scaleFactor: null,
        needsScaleForLinear: false,
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
      timepoint: getImageTimepoint(state)(imageId),
      captureDate: getImageCaptureDate(state)(imageId),
      manualLandmarks: getManualLandmarks(state)(imageId),
      scaleFactor: getScaleFactor(state)(imageId),
      needsScaleForLinear: hasUnreportableLinearMeasurements(state)(imageId),
    };
  };

/**
 * The report's one dispatch: complete the tracing for the analyses it is about
 * to print.
 *
 * The combined printout evaluates all nine lateral analyses from the placed
 * landmarks, but only the *active* analysis' landmarks are ever plotted — the
 * analysis-switch middleware fills in what a newly selected analysis needs, and
 * nothing filled in what an analysis the user never opened needs. So the same
 * tracing produced a different document depending on which analysis happened to
 * be open when the report was opened: with Wits active, the Soft Tissue section
 * printed "4 of 7 measured" and concluded "Skeletal profile — Normal"; after a
 * visit to the Soft Tissue analysis it printed 7 of 7 and concluded "Concave",
 * with an entire finding — "Chin prominence — Recessive", two of its three
 * measurements over two standard deviations out — that the first document
 * silently omitted. A clinician signs the certification block under that.
 *
 * This runs the identical completion pass (the same `autoPlotLandmarks`
 * dispatch, the same predictor, the same single undoable batch, and the same
 * refusal to overwrite anything already placed) for the union of every
 * analysis' landmarks instead of for one analysis' — see
 * `index.tsx#componentDidMount`.
 */
const mapDispatchToProps = (
  dispatch: GenericDispatch, { imageId }: OwnProps,
): DispatchProps => ({
  onPlotMissingLandmarks: (symbols: string[]) => {
    if (imageId === null || symbols.length === 0) {
      return;
    }
    dispatch(autoPlotLandmarks({ imageId, symbols }));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(ClinicalReport);
