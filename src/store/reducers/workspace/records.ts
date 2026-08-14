import { handleActions } from 'utils/store';

import {
  appendVisitNoteEntry, readVisitNote, refileVisitNoteEntry,
} from 'utils/visitNotes';

const KEY_DASHBOARD_SHOWN: StoreKey = 'records.dashboard.isShown';
const KEY_FILING_INTENT: StoreKey = 'records.filing.intent';
const KEY_VISIT_NOTES: StoreKey = 'records.notes';

const reducers: Partial<ReducerMap> = {
  [KEY_DASHBOARD_SHOWN]: handleActions<typeof KEY_DASHBOARD_SHOWN>({
    SET_RECORDS_DASHBOARD_SHOWN: (_, { payload: { isShown } }) => isShown,
    // Leaving the patient closes their record view; the next patient opens on
    // the editor, not on someone else's timeline.
    SET_ACTIVE_PATIENT_REQUESTED: () => false,
    /**
     * Opening a patient lands on their records — the dashboard is the patient's
     * home surface, and choosing which film to work on comes before working on
     * it. A patient with nothing on file has no record to land on, so they open
     * straight onto the upload surface instead of on an empty timeline.
     *
     * `images.props` is part of the loaded project (see the project
     * middleware); this key is not, so the value decided here survives the
     * wholesale slice replacement.
     */
    LOAD_PROJECT_SUCCEEDED: (_, { payload }) => {
      const images = payload['images.props'];
      return images !== undefined && Object.keys(images).length > 0;
    },
  }, false),
  /**
   * The slot the next upload is filing into. Written by the dashboard's empty
   * type slots and read by the upload form.
   *
   * It is cleared by *any* other navigation: switching or adding a rail tile,
   * opening another patient, and the import itself finishing either way. An
   * intent that outlived the click that made it would silently stamp a
   * clinician's next, unrelated upload as an intraoral photograph at T2 — so the
   * dashboard sets it as the last of its own actions (see
   * RecordsDashboard/connected#onAddImage), after the tile switch that would
   * otherwise clear it, and the undirected "Add image" buttons set it to null.
   */
  [KEY_FILING_INTENT]: handleActions<typeof KEY_FILING_INTENT>({
    SET_RECORD_FILING_INTENT: (_, { payload: { intent } }) => intent,
    SET_ACTIVE_WORKSPACE: () => null,
    ADD_NEW_WORKSPACE: () => null,
    IMPORT_FILE_SUCCEEDED: () => null,
    IMPORT_FILE_FAILED: () => null,
    SET_ACTIVE_PATIENT_REQUESTED: () => null,
    OPEN_PATIENT_REQUESTED: () => null,
  }, null),
  /**
   * The clinical notes of this patient's visits — the written half of the
   * record, keyed by timepoint label. @see StoreEntries['records.notes']
   *
   * Every write here is an **append** (see `appendVisitNoteEntry`): amending a
   * note adds a version beside the ones already stored, and no action in this
   * app removes one. Two consequences worth stating: a save that changed nothing
   * leaves the note exactly as it was, and re-filing a note carries its whole
   * trail across to the new key rather than starting it again.
   */
  [KEY_VISIT_NOTES]: handleActions<typeof KEY_VISIT_NOTES>({
    SAVE_VISIT_NOTE: (
      state, { payload: { timepoint, fields, savedAt, author } },
    ) => {
      const next = appendVisitNoteEntry(
        state[timepoint], fields, savedAt, author,
      );
      if (next === state[timepoint]) {
        return state;
      }
      if (next === undefined) {
        // Nothing was on file and nothing was written: there is no note to store.
        return state;
      }
      return { ...state, [timepoint]: next };
    },
    /**
     * Move a note to the visit it belongs to, with its whole amendment trail —
     * and with the fact of the move on it, so the entry cannot come to read as
     * though it had been written at the visit it was moved to (see
     * `refileVisitNoteEntry`, and the filing line every surface prints from it).
     *
     * Refused where the destination already holds a note — a move must never be
     * able to overwrite an entry somebody wrote.
     */
    REFILE_VISIT_NOTE: (state, { payload: { from, to, refiledAt } }) => {
      const note = state[from];
      if (readVisitNote(note) === null || from === to) {
        return state;
      }
      if (readVisitNote(state[to]) !== null) {
        return state;
      }
      const next = { ...state, [to]: refileVisitNoteEntry(note, from, refiledAt) };
      delete next[from];
      return next;
    },
    /**
     * Notes arriving with an imported wceph file: they fill in the visits that
     * have none and leave every note already on file untouched.
     * @see Events['LOAD_VISIT_NOTES']
     */
    LOAD_VISIT_NOTES: (state, { payload: { notes } }) => {
      const next = { ...state };
      Object.keys(notes).forEach((key) => {
        if (readVisitNote(next[key]) === null &&
          readVisitNote(notes[key]) !== null) {
          next[key] = notes[key];
        }
      });
      return next;
    },
    /**
     * A loaded project's notes replace whatever is in memory — and a project
     * saved before this key existed carries none, which must read as "this
     * patient has no notes" and not as the previous patient's notes still being
     * on screen. So the fallback is empty rather than `state`.
     */
    LOAD_PROJECT_SUCCEEDED: (_, { payload }) => {
      const notes = payload['records.notes'];
      return notes !== undefined ? notes : {};
    },
    // Leaving a patient takes their notes with them, for the same reason.
    SET_ACTIVE_PATIENT_REQUESTED: () => ({}),
  }, {}),
};

export default reducers;

export const isRecordsDashboardShown = (state: StoreState) =>
  state[KEY_DASHBOARD_SHOWN];

/**
 * The record slot the next upload is filing into (type + timepoint + capture
 * date), or null when the upload was not directed at one.
 */
export const getRecordFilingIntent = (state: StoreState) =>
  state[KEY_FILING_INTENT];

/**
 * Every visit note of the open patient, keyed by timepoint label. Read through
 * `utils/visitNotes` — `getCurrentVisitNote(notes, timepoint)` for the note of
 * one visit, `readVisitNote` for its amendment trail.
 */
export const getVisitNotes = (state: StoreState) => state[KEY_VISIT_NOTES] || {};
