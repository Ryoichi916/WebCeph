import { connect } from 'react-redux';

import uniqueId from 'lodash/uniqueId';

import RecordsDashboard from './index';

import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';

import {
  getPatientRecords,
  PatientRecord,
} from 'store/reducers/workspace';

import { isRecordsDashboardShown } from 'store/reducers/workspace/records';

import { getWorkspacesIdsInOrder } from 'store/reducers/workspace/order';
import { getWorkspaceImageIds } from 'store/reducers/workspace/settings';

import { getActivePatient } from 'store/reducers/patients';

import {
  setRecordsDashboardShown,
  setActiveWorkspace,
  setActiveImageId,
  addNewWorkspace,
  removeWorkspace,
  setImageProps,
  closeImage,
} from 'actions/workspace';

/** The first rail tile that holds no image, or null when every tile is used. */
const findEmptyWorkspaceId = (state: StoreState): string | null => {
  const ids = getWorkspacesIdsInOrder(state);
  for (const id of ids) {
    const images = getWorkspaceImageIds(state)(id) || [];
    if (images.length === 0) {
      return id;
    }
  }
  return null;
};

const mapStateToProps = (state: StoreState): StateProps => ({
  open: isRecordsDashboardShown(state),
  patient: getActivePatient(state),
  records: getPatientRecords(state),
  emptyWorkspaceId: findEmptyWorkspaceId(state),
});

const mapDispatchToProps = (dispatch: GenericDispatch): DispatchProps => ({
  onRequestClose: () => dispatch(setRecordsDashboardShown({ isShown: false })),
  // Opening a record switches to the rail tile that holds it and makes it that
  // workspace's active image, then closes the dashboard so the editor is
  // immediately usable.
  onOpenRecord: (record: PatientRecord) => {
    dispatch(setActiveWorkspace({ id: record.workspaceId }));
    dispatch(setActiveImageId({
      workspaceId: record.workspaceId,
      imageId: record.imageId,
    }));
    dispatch(setRecordsDashboardShown({ isShown: false }));
  },
  // Exactly the rail ghost tile's path (see VerticalTabBar/connected), reusing
  // an already-empty tile when one exists rather than stacking blank tiles.
  onAddImage: (emptyWorkspaceId: string | null) => {
    if (emptyWorkspaceId !== null) {
      dispatch(setActiveWorkspace({ id: emptyWorkspaceId }));
    } else {
      const id = uniqueId('workspace_');
      dispatch(addNewWorkspace({ id }));
      dispatch(setActiveWorkspace({ id }));
    }
    dispatch(setRecordsDashboardShown({ isShown: false }));
  },
  // Record metadata is stored on the image props, so correcting it is the same
  // action the importer uses. The image reducer re-reconciles the active
  // analysis with the new type, so a film re-filed as a lateral ceph becomes
  // traceable again and one filed away from it stops being analysed.
  onSaveRecordMeta: (record: PatientRecord, meta: ImageRecordMeta) => {
    dispatch(setImageProps({
      id: record.imageId,
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
    // Its rail tile only goes away when the patient has another record to land
    // on; otherwise the emptied tile becomes the upload surface again. The
    // active workspace is moved first so it never points at a removed tile.
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
)(RecordsDashboard);
