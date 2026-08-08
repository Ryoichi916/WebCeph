import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';

import RecordViewer from './index';

import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';

import {
  getImageProps,
  getImageType,
  getImageTimepoint,
  getImageCaptureDate,
} from 'store/reducers/workspace/image';

import {
  getPatientRecords,
  PatientRecord,
} from 'store/reducers/workspace';

import {
  setRecordsDashboardShown,
  setActiveWorkspace,
  setActiveImageId,
  setImageProps,
  removeWorkspace,
  closeImage,
} from 'actions/workspace';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState, { imageId }: OwnProps): StateProps => {
    const props = getImageProps(state)(imageId);
    return {
      src: (props && props.data) || null,
      name: (props && props.name) || null,
      width: (props && props.width) || null,
      height: (props && props.height) || null,
      type: getImageType(state)(imageId),
      timepoint: getImageTimepoint(state)(imageId),
      captureDate: getImageCaptureDate(state)(imageId),
      records: getPatientRecords(state),
    };
  };

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> =
  (dispatch: GenericDispatch, { imageId }: OwnProps): DispatchProps => ({
    onOpenRecordsClick: () => dispatch(setRecordsDashboardShown({ isShown: true })),
    // Same path the records dashboard uses to open a card.
    onOpenRecord: (record: PatientRecord) => {
      dispatch(setActiveWorkspace({ id: record.workspaceId }));
      dispatch(setActiveImageId({
        workspaceId: record.workspaceId,
        imageId: record.imageId,
      }));
    },
    onSaveMeta: (meta: ImageRecordMeta) => {
      dispatch(setImageProps({
        id: imageId,
        type: meta.type,
        timepoint: meta.timepoint,
        captureDate: meta.captureDate,
      }));
    },
    onRemoveRecord: (record: PatientRecord, fallbackWorkspaceId: string | null) => {
      dispatch(closeImage({
        imageId: record.imageId,
        workspaceId: record.workspaceId,
      }));
      if (fallbackWorkspaceId !== null) {
        dispatch(setActiveWorkspace({ id: fallbackWorkspaceId }));
        dispatch(removeWorkspace({
          id: record.workspaceId,
          removeUnreferencedImages: true,
        }));
      }
    },
  });

export default connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(RecordViewer);
