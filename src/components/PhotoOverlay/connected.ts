import { connect } from 'react-redux';

import PhotoOverlay from './index';
import { StateProps, DispatchProps, OwnProps } from './props';

import { getActivePatient } from 'store/reducers/patients';
import {
  getImageSrc,
  getImageWidth,
  getImageHeight,
  getImageTimepoint,
  getImageCaptureDate,
} from 'store/reducers/workspace/image';
import { getPhotoRegistrations } from 'store/reducers/workspace/photoRegistration';

import { getPhotoOverlayCephs } from './selectors';

import {
  setPhotoRegistration,
  removePhotoRegistration,
} from 'actions/workspace';

const mapStateToProps = (state: StoreState, { imageId }: OwnProps): StateProps => {
  const registration = getPhotoRegistrations(state)[imageId];
  return {
    patient: getActivePatient(state),
    src: getImageSrc(state)(imageId),
    width: getImageWidth(state)(imageId),
    height: getImageHeight(state)(imageId),
    timepoint: getImageTimepoint(state)(imageId),
    captureDate: getImageCaptureDate(state)(imageId),
    cephs: getPhotoOverlayCephs(state),
    registration: registration !== undefined ? registration : null,
  };
};

/**
 * Unlike the treatment simulation — whose whole point is that it can reach
 * nothing — the overlay's registration is part of the record: the two clicked
 * points, the chosen ceph and the facing are dispatched to the store and
 * persisted with the project, so the registration made once is still there
 * tomorrow. Nothing here can touch the tracing itself.
 */
const mapDispatchToProps = (dispatch: GenericDispatch): DispatchProps => ({
  onSetRegistration: (payload) => dispatch(setPhotoRegistration(payload)),
  onRemoveRegistration: (imageId) =>
    dispatch(removePhotoRegistration({ imageId })),
});

export default connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(PhotoOverlay);
