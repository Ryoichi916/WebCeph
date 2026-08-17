import { handleActions } from 'utils/store';
import { createSelector } from 'reselect';
import omit from 'lodash/omit';

const KEY_BY_ID: StoreKey = 'patients.byId';
const KEY_ACTIVE: StoreKey = 'patients.activeId';
const KEY_CASE_INDEX: StoreKey = 'patients.caseIndex';
const KEY_RESTORE_ERROR: StoreKey = 'patients.restoreError';

const reducers: Partial<ReducerMap> = {
  [KEY_BY_ID]: handleActions<typeof KEY_BY_ID>(
    {
      ADD_PATIENT_REQUESTED: (
        state, { payload: { id, name, chartId, dateOfBirth, sex, reading } },
      ) => ({
        ...state,
        [id]: { id, name, chartId, dateOfBirth, sex, reading },
      }),
      // Spread over whatever is already on file: the dialog corrects the four
      // demographic fields, and everything else the record carries about how this
      // patient is read (their trend board) is not part of that correction.
      UPDATE_PATIENT_REQUESTED: (
        state, { payload: { id, name, chartId, dateOfBirth, sex, reading } },
      ) => ({
        ...state,
        [id]: { ...state[id], id, name, chartId, dateOfBirth, sex, reading },
      }),
      // Which measurements this patient's trend board plots. Ignored for a
      // patient not on file, so a stale panel cannot resurrect a removed record.
      SET_PATIENT_TREND_PLOT_REQUESTED: (state, { payload: { id, symbols } }) => (
        state[id] === undefined
          ? state
          : { ...state, [id]: { ...state[id], trendPlot: symbols } }
      ),
      REMOVE_PATIENT_REQUESTED: (state, { payload: { id } }) =>
        omit(state, id) as typeof state,
    },
    {},
  ),
  /**
   * The case list's index of what each patient's saved record holds. Derived,
   * never authored: the project middleware counts it off the project it just
   * wrote (or just loaded) and it is dropped with the patient, so it can never
   * outlive the record it describes. @see PatientCaseSummary
   */
  [KEY_CASE_INDEX]: handleActions<typeof KEY_CASE_INDEX>(
    {
      SET_PATIENT_CASE_SUMMARY: (state, { payload: { id, summary } }) => ({
        ...state,
        [id]: summary,
      }),
      REMOVE_PATIENT_REQUESTED: (state, { payload: { id } }) =>
        omit(state, id) as typeof state,
    },
    {},
  ),
  /**
   * Why the last restore from a case file failed — the one thing the case list
   * could not say before, because the restore closes the list the moment it
   * registers the chart. Cleared as soon as anything is registered or opened, so
   * it can only ever describe the act that has just happened.
   * @see StoreState['patients.restoreError']
   */
  [KEY_RESTORE_ERROR]: handleActions<typeof KEY_RESTORE_ERROR>(
    {
      RESTORE_FROM_CASE_FILE_FAILED: (_, { payload: { error } }) => error,
      ADD_PATIENT_REQUESTED: () => null,
      OPEN_PATIENT_REQUESTED: () => null,
    },
    null,
  ),
  [KEY_ACTIVE]: handleActions<typeof KEY_ACTIVE>(
    {
      // Opening a patient (which also loads their project) makes them active;
      // see LOAD_PROJECT_SUCCEEDED, which carries patients.activeId.
      SET_ACTIVE_PATIENT_REQUESTED: (_, { payload: { id } }) => id,
      REMOVE_PATIENT_REQUESTED: (state, { payload: { id } }) =>
        state === id ? null : state,
    },
    null,
  ),
};

export default reducers;

// Read defensively: the case-file exporter asks who the patient is from
// whatever state it is handed, and a store without these keys must produce a
// file that carries no patient rather than throwing on the way out.
export const getPatientsById = (state: StoreState) => state[KEY_BY_ID] || {};
export const getActivePatientId = (state: StoreState) =>
  state[KEY_ACTIVE] !== undefined ? state[KEY_ACTIVE] : null;

/** What each patient's saved project holds, keyed by patient id. */
export const getPatientCaseIndex = (state: StoreState) => state[KEY_CASE_INDEX];

/**
 * Why the last restore from a case file failed, or null — read by the case list,
 * which is where the clinician is put back when one does.
 * @see StoreState['patients.restoreError']
 */
export const getRestoreFromCaseFileError = (state: StoreState) =>
  state[KEY_RESTORE_ERROR] !== undefined ? state[KEY_RESTORE_ERROR] : null;

export const getPatientsList = createSelector(
  getPatientsById,
  (byId) => Object.keys(byId).map((id) => byId[id]),
);

export const getActivePatient = createSelector(
  getPatientsById,
  getActivePatientId,
  (byId, activeId) => (activeId !== null ? byId[activeId] || null : null),
);
