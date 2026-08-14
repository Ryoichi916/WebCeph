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
  getImagePhotoView,
} from 'store/reducers/workspace/image';

import {
  getPatientRecords,
  PatientRecord,
} from 'store/reducers/workspace';

import {
  getActivePatient,
  getPatientsList,
} from 'store/reducers/patients';

import { getVisitNotes } from 'store/reducers/workspace/records';

import { PatientDetails } from 'components/PatientFields';

import {
  setRecordsDashboardShown,
  setActiveWorkspace,
  setActiveImageId,
  setImageProps,
  removeWorkspace,
  updatePatient,
  refileVisitNote,
  closeImage,
} from 'actions/workspace';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (state: StoreState, { imageId }: OwnProps): StateProps => {
    const props = getImageProps(state)(imageId);
    const patient = getActivePatient(state);
    return {
      patient,
      otherChartIds: getPatientsList(state)
        .filter((p) => patient === null || p.id !== patient.id)
        .map((p) => p.chartId || ''),
      src: (props && props.data) || null,
      name: (props && props.name) || null,
      width: (props && props.width) || null,
      height: (props && props.height) || null,
      type: getImageType(state)(imageId),
      timepoint: getImageTimepoint(state)(imageId),
      captureDate: getImageCaptureDate(state)(imageId),
      photoView: getImagePhotoView(state)(imageId),
      records: getPatientRecords(state),
      notes: getVisitNotes(state),
    };
  };

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> =
  (dispatch: GenericDispatch, { imageId }: OwnProps): DispatchProps => ({
    onOpenRecordsClick: () => dispatch(setRecordsDashboardShown({ isShown: true })),
    // The dashboard's own path (RecordsDashboard/connected#onSavePatient): the
    // action registration uses, so one code path writes a patient's demographics.
    onSavePatient: (id: string, details: PatientDetails) => {
      dispatch(updatePatient({
        id,
        name: details.name,
        chartId: details.chartId,
        dateOfBirth: details.dateOfBirth,
        sex: details.sex,
        reading: details.reading,
      }));
    },
    // Same path the records dashboard uses to open a card.
    onOpenRecord: (record: PatientRecord) => {
      dispatch(setActiveWorkspace({ id: record.workspaceId }));
      dispatch(setActiveImageId({
        workspaceId: record.workspaceId,
        imageId: record.imageId,
      }));
    },
    // The dashboard's own path (RecordsDashboard/connected#onRefileVisitNote).
    onRefileVisitNote: (from: string, to: string) => {
      dispatch(refileVisitNote({ from, to, refiledAt: new Date().getTime() }));
    },
    onSaveMeta: (meta: ImageRecordMeta) => {
      dispatch(setImageProps({
        id: imageId,
        type: meta.type,
        timepoint: meta.timepoint,
        captureDate: meta.captureDate,
        photoView: meta.photoView,
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
