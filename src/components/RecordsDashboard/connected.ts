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

import { getRecordAnalyses, getRecordLaunch } from './selectors';

import { getWorkspacesIdsInOrder } from 'store/reducers/workspace/order';
import { getWorkspaceImageIds } from 'store/reducers/workspace/settings';

import {
  getActivePatient,
  getPatientsList,
} from 'store/reducers/patients';

import { PatientDetails } from 'components/PatientFields';

import {
  setRecordsDashboardShown,
  setRecordFilingIntent,
  setActiveWorkspace,
  setActiveImageId,
  addNewWorkspace,
  removeWorkspace,
  setImageProps,
  updatePatient,
  setPatientTrendPlot,
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

const mapStateToProps = (state: StoreState): StateProps => {
  const patient = getActivePatient(state);
  return {
    patient,
    records: getPatientRecords(state),
    // Read-only: this selector never dispatches and never changes which
    // analysis is active — it reads each film's own analysis through the store's
    // own per-image selectors (see ./selectors).
    analyses: getRecordAnalyses(state),
    // What each film's card can open, read from the modules that own those
    // views' own availability rules (see ./selectors). Memoized, so the launch
    // strip does not re-derive nine simulation readiness checks on every mouse
    // move over the canvas behind this surface.
    launch: getRecordLaunch(state),
    otherChartIds: getPatientsList(state)
      .filter((p) => patient === null || p.id !== patient.id)
      .map((p) => p.chartId || ''),
    emptyWorkspaceId: findEmptyWorkspaceId(state),
  };
};

const mapDispatchToProps = (dispatch: GenericDispatch): DispatchProps => ({
  onBackToEditor: () => dispatch(setRecordsDashboardShown({ isShown: false })),
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
  //
  // `intent` carries the slot the clinician clicked (type + timepoint + the
  // visit's day) through to the upload form, which opens on those values instead
  // of asking for them again. It is dispatched *last* deliberately: switching or
  // adding a rail tile clears a pending intent (that is what keeps a stale one
  // from stamping an unrelated upload — see the records reducer), so the tile
  // move has to happen first.
  onAddImage: (
    emptyWorkspaceId: string | null, intent?: ImageRecordMeta | null,
  ) => {
    if (emptyWorkspaceId !== null) {
      dispatch(setActiveWorkspace({ id: emptyWorkspaceId }));
    } else {
      const id = uniqueId('workspace_');
      dispatch(addNewWorkspace({ id }));
      dispatch(setActiveWorkspace({ id }));
    }
    dispatch(setRecordFilingIntent({
      intent: intent !== undefined ? intent : null,
    }));
    dispatch(setRecordsDashboardShown({ isShown: false }));
  },
  // A patient's own details are corrected with the same action registration
  // uses, so the persistence middleware saves the corrected record exactly the
  // way it saved the original.
  onSavePatient: (id: string, details: PatientDetails) => {
    dispatch(updatePatient({
      id,
      name: details.name,
      chartId: details.chartId,
      dateOfBirth: details.dateOfBirth,
      sex: details.sex,
    }));
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
  // The trend board is a per-patient clinical setting, not a view state, so it
  // is dispatched to the store the demographics live in and persisted with them.
  onSetTrendPlot: (patientId: string, symbols: string[] | null) => {
    dispatch(setPatientTrendPlot({ id: patientId, symbols }));
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
