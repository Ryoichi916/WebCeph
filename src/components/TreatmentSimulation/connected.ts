import { connect } from 'react-redux';

import TreatmentSimulation from './index';
import { StateProps, OwnProps } from './props';

import { getActivePatient } from 'store/reducers/patients';
import {
  getManualLandmarks,
  getScaleFactor,
  getImageSrc,
  getImageWidth,
  getImageHeight,
  getImageTimepoint,
  getImageCaptureDate,
} from 'store/reducers/workspace/image';

const EMPTY_LANDMARKS: StateProps['landmarks'] = { };

/**
 * Read-only wiring: the treatment simulation takes the tracing as it stands and
 * keeps every movement in the view's own React state. There is deliberately no
 * `mapDispatchToProps` — nothing this view does can reach the store, so it can
 * never touch the real tracing, the undo history, the exports or the report.
 */
const mapStateToProps = (state: StoreState, { imageId }: OwnProps): StateProps => {
  if (imageId === null) {
    return {
      patient: getActivePatient(state),
      src: null,
      width: null,
      height: null,
      scaleFactor: null,
      landmarks: EMPTY_LANDMARKS,
      timepoint: null,
      captureDate: null,
    };
  }
  return {
    patient: getActivePatient(state),
    src: getImageSrc(state)(imageId),
    width: getImageWidth(state)(imageId),
    height: getImageHeight(state)(imageId),
    scaleFactor: getScaleFactor(state)(imageId),
    landmarks: getManualLandmarks(state)(imageId),
    timepoint: getImageTimepoint(state)(imageId),
    captureDate: getImageCaptureDate(state)(imageId),
  };
};

export default connect<StateProps, { }, OwnProps>(
  mapStateToProps,
)(TreatmentSimulation);
