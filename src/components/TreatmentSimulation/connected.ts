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
import { getPhotoRegistrations } from 'store/reducers/workspace/photoRegistration';
import { REGISTRATION_SYMBOLS } from 'analyses/photoOverlay';

const EMPTY_LANDMARKS: StateProps['landmarks'] = { };

/**
 * The registered profile photograph pointing at this film, when one exists
 * with both registration points placed and a loadable image — read-only
 * plumbing for the simulation's photo-preview tab. When several photographs
 * are registered against the same film, the one sharing its timepoint wins,
 * then the first found: the registration itself already names one ceph per
 * photograph, so ties beyond that are a corner case not worth a picker.
 */
const findRegisteredPhoto = (
  state: StoreState, cephImageId: string,
): StateProps['photo'] => {
  const registrations = getPhotoRegistrations(state);
  const candidates = Object.keys(registrations).filter((photoId) => {
    const entry = registrations[photoId];
    return entry.cephImageId === cephImageId &&
      REGISTRATION_SYMBOLS.every((s) => entry.points[s] !== undefined);
  });
  if (candidates.length === 0) {
    return null;
  }
  const cephTimepoint = getImageTimepoint(state)(cephImageId);
  const sameVisit = candidates.filter(
    (photoId) => getImageTimepoint(state)(photoId) === cephTimepoint,
  );
  const chosen = (sameVisit.length > 0 ? sameVisit : candidates)[0];
  const src = getImageSrc(state)(chosen);
  const width = getImageWidth(state)(chosen);
  const height = getImageHeight(state)(chosen);
  if (src === null || !(width > 0) || !(height > 0)) {
    return null;
  }
  return {
    imageId: chosen,
    src,
    width,
    height,
    registration: registrations[chosen],
  };
};

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
      photo: null,
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
    photo: findRegisteredPhoto(state, imageId),
  };
};

export default connect<StateProps, { }, OwnProps>(
  mapStateToProps,
)(TreatmentSimulation);
