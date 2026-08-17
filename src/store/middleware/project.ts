import { Store, Middleware } from 'redux';
import idb from 'idb-keyval';

import { isActionOfType } from 'utils/store';
import {
  loadProjectSucceeded, setPatientCaseSummary, saveProject,
  importFileRequested, removePatient, restoreFromCaseFileFailed,
} from 'actions/workspace';
import { defaultWorkspaceId, defaultWorkspaceSettings } from 'utils/config';
import { getPatientRecords } from 'store/reducers/workspace';
import { getPatientCaseIndex } from 'store/reducers/patients';
import {
  summarizeCaseRecords,
  findCaseThumbnailRecord,
} from 'utils/caseSummary';

// The state slices that make up a patient's project: the images (with their
// pixel data), the tracings, the clinical notes of each visit, and the
// workspace/tab layout.
const PROJECT_KEYS: StoreKey[] = [
  'images.props',
  'images.status',
  'images.tracing',
  // The written half of the record — one note per visit, with its amendment
  // trail. It is part of the project and not of the patient's own row because it
  // belongs to the visits the project holds. @see StoreEntries['records.notes']
  'records.notes',
  'workspaces.settings',
  'workspaces.order',
  'workspaces.activeWorkspaceId',
];

// A blank project: one empty workspace, no images.
const emptyProject = (): Partial<StoreState> => ({
  'images.props': {},
  'images.status': {},
  'images.tracing': {},
  'records.notes': {},
  'workspaces.settings': { [defaultWorkspaceId]: defaultWorkspaceSettings },
  'workspaces.order': [defaultWorkspaceId],
  'workspaces.activeWorkspaceId': defaultWorkspaceId,
});

const storageKey = (patientId: string) => `project:${patientId}`;

/**
 * The patient whose project could NOT be read when it was opened, although the
 * case list says they have records on file — or null, which is the normal case.
 *
 * Opening a patient loads a blank workspace when nothing comes back from
 * storage, and leaving the workspace writes what is in memory (see
 * PatientBar's `onChangePatient`). Together, those two steps take a case whose
 * project failed to read and write an *empty* project over it, then count that
 * emptiness into the case list — one click erases the record and its row. So the
 * blank stand-in is marked here, and neither the write nor the count is allowed
 * to happen from it while it is still blank.
 */
let unbackedPatientId: string | null = null;

/**
 * The chart a case file is being restored **into**, while that is happening —
 * or null, which is every other moment.
 *
 * A restore is two acts in one press: register the chart the file names, then
 * read the file into it. If the second fails, the first must not stand. Nothing
 * of the case reached the record (the wceph importer builds every action before
 * it dispatches one, so a file that breaks breaks whole), and the clinician is
 * otherwise left with an empty chart on the case list, their only copy
 * apparently refused, and nothing said anywhere.
 *
 * So the registration is reversed here and the reason is put where the case list
 * can state it. @see StoreState['patients.restoreError']
 */
let restoringPatientId: string | null = null;

// ---- The case list's index --------------------------------------------------

/**
 * How large the case list's film thumbnail is rendered, in device pixels. The
 * row shows it at ~40×48 CSS px, so this is a 2× tile — big enough to stay crisp
 * on a retina panel, small enough that a practice with hundreds of cases carries
 * a few hundred KB of thumbnails in its persisted state rather than the hundreds
 * of megabytes the films themselves run to.
 */
const THUMB_MAX_WIDTH = 96;
const THUMB_MAX_HEIGHT = 120;

/**
 * Downscales one film to a case-list thumbnail, resolving with a JPEG data URI
 * (or null when the image cannot be decoded or no 2D context is available).
 *
 * `contain`, never crop: a cephalogram cropped to a square is a picture of a
 * cheek, and the row's tile is the one place the list shows the film itself.
 */
const renderCaseThumbnail = (src: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w === 0 || h === 0) {
        resolve(null);
        return;
      }
      const scale = Math.min(THUMB_MAX_WIDTH / w, THUMB_MAX_HEIGHT / h, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // JPEG at a modest quality: the source is a photographic radiograph and
      // the tile is 40px wide on screen.
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

/**
 * Counts what a patient's project holds and files it beside the patient, so the
 * case list can show and sort the case without opening it.
 *
 * Called with the state the project was written from (on save) or loaded into
 * (on open), which is what keeps the index honest: it is only ever a reading of
 * a project that is actually on disk. @see PatientCaseSummary
 *
 * It will not, however, replace a row that says something with one that says
 * nothing. An all-zero count over an existing non-empty summary is not the
 * practice emptying a chart — it is this process having failed to read the
 * project (a storage error, a blocked database, a blob that never made it back),
 * and a storage failure must never silently rewrite the practice's index. The
 * row is left as it was; the next save writes the truth.
 */
const refreshCaseSummary = async (
  state: StoreState,
  patientId: string,
  dispatch: GenericDispatch,
  previous?: PatientCaseSummary,
) => {
  try {
    const records = getPatientRecords(state);
    const counts = summarizeCaseRecords(records);
    if (
      counts.recordCount === 0 &&
      previous !== undefined && previous.recordCount > 0
    ) {
      console.warn(
        'Refusing to overwrite the case summary of a patient whose project ' +
        'read back empty — the row on the case list is left as it was.',
      );
      return;
    }
    const film = findCaseThumbnailRecord(records);
    const thumbnail = film !== null && film.thumbnail !== null
      ? await renderCaseThumbnail(film.thumbnail)
      : null;
    dispatch(setPatientCaseSummary({
      id: patientId,
      summary: {
        ...counts,
        savedAt: new Date().getTime(),
        thumbnail,
        thumbnailType: thumbnail !== null && film !== null ? film.type : null,
      },
    }));
  } catch (e) {
    // A summary is a convenience for the list, never part of the record: a
    // failure here must not take the save or the open down with it.
    console.error('Failed to summarize the patient\'s case', e);
  }
};

const middleware = ({ getState, dispatch }: Store<StoreState>) =>
  (next: GenericDispatch) => async (action: GenericAction) => {
    if (isActionOfType(action, 'OPEN_PATIENT_REQUESTED')) {
      next(action);
      const { patientId } = action.payload;
      let project: Partial<StoreState>;
      // Whether a project was actually read back. A patient opened for the first
      // time gets a blank workspace, and so does one whose project could not be
      // read — but only the *read* one may be counted into the case list.
      let loaded = false;
      try {
        const saved = await idb.get(storageKey(patientId)) as Partial<StoreState> | undefined;
        if (saved) {
          project = saved;
          loaded = true;
        } else {
          project = emptyProject();
        }
      } catch (e) {
        console.error('Failed to open project', e);
        project = emptyProject();
      }
      dispatch(loadProjectSucceeded({
        ...project,
        'patients.activeId': patientId,
      }));
      // Re-count the case off the project that was just loaded. Opening a case
      // is the one moment its whole record is in memory anyway, so this both
      // fills in the row of a patient whose project was saved before the list
      // kept an index and repairs any row that has drifted from the file.
      //
      // Only off a project that was read, though: an empty workspace stood in
      // for one that could not be read, and counting *that* into the index
      // rewrote a good row to "no records" — opening a case must never be able
      // to erase it from the list. @see refreshCaseSummary
      const existing = getPatientCaseIndex(getState())[patientId];
      const hadRecords = existing !== undefined && existing.recordCount > 0;
      unbackedPatientId = !loaded && hadRecords ? patientId : null;
      if (unbackedPatientId !== null) {
        console.warn(
          `The saved project for patient ${patientId} could not be read, but ` +
          `the case list has ${existing.recordCount} image(s) on file for ` +
          `them. Leaving the record as it is: nothing will be written over it ` +
          `until something is actually filed in this session.`,
        );
      }
      if (loaded) {
        await refreshCaseSummary(getState(), patientId, dispatch, existing);
      }
      /**
       * …and, where the chart was opened in order to restore a case file into
       * it, read the file in now that the project slices are in place.
       *
       * Sequenced here rather than beside the open because `loadProjectSucceeded`
       * replaces those slices wholesale (see store/index#enableLoadingProject):
       * an import dispatched in the same tick would have its images replaced by
       * the empty project a moment later, and the clinician would watch their
       * only copy be read in and then vanish.
       */
      const { restoreFromCaseFile } = action.payload;
      if (restoreFromCaseFile !== undefined) {
        const workspaceId = getState()['workspaces.activeWorkspaceId'];
        if (workspaceId !== null) {
          // Which chart this file is being restored into, so a restore that does
          // not land can be undone rather than leaving a brand-new empty chart
          // on the case list. @see restoringPatientId
          restoringPatientId = patientId;
          dispatch(importFileRequested({
            file: restoreFromCaseFile,
            workspaceId,
            // Read through the case file path deliberately: this *is* the case
            // file surface. @see store/middleware/import
            isCaseFile: true,
          }));
        }
      }
      return;
    }

    if (isActionOfType(action, 'SAVE_PROJECT_REQUESTED')) {
      next(action);
      const { patientId } = action.payload;
      const state = getState() as any;
      // The workspace is saved on the way out of every case, including a case
      // whose project could not be read — and there the workspace holds the
      // blank stand-in, not the record. Writing that would destroy the project
      // and the row together. @see unbackedPatientId
      if (
        patientId === unbackedPatientId &&
        getPatientRecords(state as StoreState).length === 0
      ) {
        console.warn(
          `Not saving an empty project over patient ${patientId}, whose saved ` +
          `project could not be read when the case was opened.`,
        );
        return;
      }
      unbackedPatientId = null;
      const project: Partial<StoreState> = {};
      PROJECT_KEYS.forEach((key) => { (project as any)[key] = state[key]; });
      try {
        await idb.set(storageKey(patientId), project);
      } catch (e) {
        console.error('Failed to save project', e);
        return;
      }
      // The list's row for this case, counted off the very state just written.
      await refreshCaseSummary(state as StoreState, patientId, dispatch);
      return;
    }

    /**
     * A clinical note is written to storage the moment it is saved.
     *
     * Everything else in a project is a *file* the clinician chose and can choose
     * again: an image lost to a closed tab is re-uploaded from the folder it came
     * from. A note exists nowhere but here — it is typed once, into a dialog that
     * states it will be "kept with the patient's project" — and until this branch
     * existed that promise came true only when something else happened to save the
     * project (leaving the case, or the toolbar's Save). A clinician who wrote a
     * diagnosis and closed the tab lost it.
     *
     * It goes through SAVE_PROJECT_REQUESTED rather than writing a key of its own:
     * one write path for the project means one set of guards (see
     * `unbackedPatientId`) and one place the case list's row is re-counted from
     * what was actually written.
     */
    if (
      isActionOfType(action, 'SAVE_VISIT_NOTE') ||
      isActionOfType(action, 'REFILE_VISIT_NOTE')
    ) {
      next(action);
      const patientId = getState()['patients.activeId'];
      if (patientId !== null) {
        dispatch(saveProject({ patientId }));
      }
      return;
    }

    /**
     * A case file that has just been read into a chart is on disk immediately.
     *
     * The same reasoning as the note above, one step harder: an import is very
     * often a *restore* — the machine changed, the browser was cleared, the case
     * came from a colleague — and the file the clinician is holding may be the
     * only copy there is. The dialog tells them in so many words that "12 images
     * are added to this chart"; until this branch existed nothing wrote them
     * anywhere, so a refresh put the chart back to "No images on file yet" and
     * the restore had to be done again from a file they may already have closed.
     *
     * Through SAVE_PROJECT_REQUESTED for the same reason the note is: one write
     * path, one set of guards, one place the case list's row is re-counted.
     */
    if (isActionOfType(action, 'IMPORT_FILE_SUCCEEDED')) {
      next(action);
      restoringPatientId = null;
      const patientId = getState()['patients.activeId'];
      if (patientId !== null) {
        dispatch(saveProject({ patientId }));
      }
      return;
    }

    /**
     * A restore that did not land: the chart it registered comes back off the
     * list, and the reason goes where the list can state it.
     *
     * Only for a restore — an import into a chart that already exists is
     * reported by the case file dialog, which stays open for exactly this, and
     * that chart is the clinician's and stays. @see restoringPatientId
     */
    if (isActionOfType(action, 'IMPORT_FILE_FAILED')) {
      next(action);
      const patientId = restoringPatientId;
      restoringPatientId = null;
      if (patientId !== null) {
        const { error } = action.payload;
        console.warn(
          `The case file being restored into patient ${patientId} could not be ` +
          `read, so that chart is being removed again: nothing of the case was ` +
          `written to it.`,
          error,
        );
        // Through the ordinary removal, which is also what drops the chart's
        // (empty) project and its row from the case index — one path.
        dispatch(removePatient({ id: patientId }));
        dispatch(restoreFromCaseFileFailed({ error }));
      }
      return;
    }

    if (isActionOfType(action, 'REMOVE_PATIENT_REQUESTED')) {
      next(action);
      const { id } = action.payload;
      // The confirmation says the patient's saved project goes with them; it has
      // to be true. (The store drops the patient and their case-list row itself.)
      try {
        await idb.delete(storageKey(id));
      } catch (e) {
        console.error('Failed to delete project', e);
      }
      return;
    }

    return next(action);
  };

export default middleware as Middleware;
