/**
 * Writing the case out as one `.wceph` — the state of the act itself.
 *
 * The chart's images, tracings, calibrations, photographic series and clinical
 * entries leave this device in exactly one artefact, and until this reducer
 * existed nothing in the app knew whether writing it had worked. `isExporting`
 * lived on `WorkspaceSettings`, no reducer ever set it, and the middleware
 * swallowed a failure into `console.error` — so a clinician who pressed
 * "Export case file" on a chart the writer could not serialise saw the dialog
 * close, no file arrive, and no word about either. That is the worst failure
 * this app can have: it is the only copy.
 *
 * So the three moments are recorded, in one place, and both the dialog and the
 * toolbar read them:
 *
 *  - **requested** — writing, with the zip's own progress as it goes;
 *  - **succeeded** — written, *named*, so the reader is told what to look for;
 *  - **failed** — with the reason, in the words the writer gave.
 *
 * A key of its own rather than a field of a workspace because an export is the
 * whole chart (@see utils/importers/wceph/v1/export#getChartImageIds), not one
 * rail tile — and because this is an act in progress and must never be written
 * into a patient's saved project.
 */

import { handleActions } from 'utils/store';

const KEY_FILE_EXPORT: StoreKey = 'file.export';

const idle: StoreState['file.export'] = {
  isExporting: false,
  progress: null,
  fileName: null,
  error: null,
};

const reducers: Partial<ReducerMap> = {
  [KEY_FILE_EXPORT]: handleActions<typeof KEY_FILE_EXPORT>({
    EXPORT_FILE_REQUESTED: () => ({
      isExporting: true,
      progress: 0,
      // The previous run's outcome goes with the previous run: a stale "written
      // as C-7000 Nao Kubo.wceph" under a spinner would be read as this one's.
      fileName: null,
      error: null,
    }),
    EXPORT_PROGRESS_CHANGED: (state, { payload: { value } }) => {
      if (!state.isExporting) {
        return state;
      }
      return { ...state, progress: value };
    },
    EXPORT_FILE_SUCCEEDED: (_, { payload: { fileName } }) => ({
      isExporting: false,
      progress: null,
      fileName,
      error: null,
    }),
    EXPORT_FILE_FAILED: (_, { payload }) => ({
      isExporting: false,
      progress: null,
      fileName: null,
      error: payload,
    }),
  }, idle),
};

export default reducers;

export const getFileExportState = (state: StoreState) =>
  state[KEY_FILE_EXPORT] || idle;

/** Whether a case file is being written at this moment. */
export const isExportingFile = (state: StoreState) =>
  getFileExportState(state).isExporting;

/** How far it has got, 0–100, or null when nothing is being written. */
export const getFileExportProgress = (state: StoreState) =>
  getFileExportState(state).progress;

/** The name the last export was written under, or null. */
export const getExportedFileName = (state: StoreState) =>
  getFileExportState(state).fileName;

/** Why the last export failed, or null. */
export const getFileExportError = (state: StoreState) =>
  getFileExportState(state).error;
