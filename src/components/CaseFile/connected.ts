import { connect } from 'react-redux';


import CaseFile from './index';
import { StateProps, OwnProps, Props } from './props';

import {
  exportFile,
  importFileRequested,
  addNewWorkspace,
  setActiveWorkspace,
} from 'actions/workspace';

import { getActivePatient } from 'store/reducers/patients';
import {
  isExporting,
  getFileExportProgress,
  getExportedFileName,
  getFileExportError,
  isImportingIntoActiveWorkspace,
  getActiveWorkspaceImportError,
} from 'store/reducers/workspace';
import { getWorkspacesIdsInOrder } from 'store/reducers/workspace/order';
import { getWorkspaceImageIds } from 'store/reducers/workspace/settings';

import { readManifestFromState } from 'utils/importers/wceph/v1/manifest';
import { mintWorkspaceId } from 'utils/ids';

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

type StateFromStore = StateProps & {
  patientId: string | null;
  emptyWorkspaceId: string | null;
};

const mapStateToProps = (state: StoreState): StateFromStore => {
  const patient = getActivePatient(state);
  return {
    patient,
    patientId: patient !== null ? patient.id : null,
    // Counted off the store, so the dialog states this chart rather than a
    // shape the file might have. @see utils/importers/wceph/v1/manifest
    manifest: readManifestFromState(state),
    isExporting: isExporting(state),
    exportProgress: getFileExportProgress(state),
    exportedFileName: getExportedFileName(state),
    exportError: getFileExportError(state),
    // The dialog stays open until the import resolves either way, so both of
    // these reach the person who chose the file. @see components/CaseFile
    isImporting: isImportingIntoActiveWorkspace(state),
    importError: getActiveWorkspaceImportError(state),
    emptyWorkspaceId: findEmptyWorkspaceId(state),
  };
};

const mergeProps = (
  stateProps: StateFromStore,
  { dispatch }: { dispatch: GenericDispatch },
  ownProps: OwnProps,
): Props => {
  const { patientId, emptyWorkspaceId, ...rest } = stateProps;
  return {
    ...rest,
    ...ownProps,
    onExport: () => dispatch(exportFile({ format: 'wceph_v1' })),
    /**
     * Read the file into the open chart — and **only** that.
     *
     * The file goes through `IMPORT_FILE_REQUESTED`, the same path every upload
     * and every dropped file takes, aimed at an empty rail tile so the case's
     * first image does not have to displace anything; the wceph importer gives
     * each further image a tile of its own. It is flagged `isCaseFile` because
     * this dialog is the one surface allowed to open one: the import middleware
     * refuses a `.wceph` handed to any image input, which is what stopped a
     * whole foreign case being merged from "Add image" with no confirmation.
     *
     * The demographic patch travels with it and is written only if the import
     * lands — @see Events['IMPORT_FILE_REQUESTED']#patientPatch.
     */
    onImport: (file: File, demographics: Partial<Patient> | null) => {
      let workspaceId = emptyWorkspaceId;
      if (workspaceId === null) {
        workspaceId = mintWorkspaceId();
        dispatch(addNewWorkspace({ id: workspaceId }));
      }
      dispatch(setActiveWorkspace({ id: workspaceId }));
      dispatch(importFileRequested({
        file, workspaceId, isCaseFile: true,
        patientPatch: demographics !== null ? demographics : undefined,
      }));
    },
  };
};

const mapDispatchToProps = (dispatch: GenericDispatch) => ({ dispatch });

export default connect(
  mapStateToProps, mapDispatchToProps, mergeProps,
)(CaseFile);
