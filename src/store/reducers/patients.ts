import { handleActions } from 'utils/store';
import { createSelector } from 'reselect';
import omit from 'lodash/omit';

const KEY_BY_ID: StoreKey = 'patients.byId';
const KEY_ACTIVE: StoreKey = 'patients.activeId';

const reducers: Partial<ReducerMap> = {
  [KEY_BY_ID]: handleActions<typeof KEY_BY_ID>(
    {
      ADD_PATIENT_REQUESTED: (
        state, { payload: { id, name, chartId, dateOfBirth, sex } },
      ) => ({
        ...state,
        [id]: { id, name, chartId, dateOfBirth, sex },
      }),
      // Spread over whatever is already on file: the dialog corrects the four
      // demographic fields, and everything else the record carries about how this
      // patient is read (their trend board) is not part of that correction.
      UPDATE_PATIENT_REQUESTED: (
        state, { payload: { id, name, chartId, dateOfBirth, sex } },
      ) => ({
        ...state,
        [id]: { ...state[id], id, name, chartId, dateOfBirth, sex },
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

export const getPatientsById = (state: StoreState) => state[KEY_BY_ID];
export const getActivePatientId = (state: StoreState) => state[KEY_ACTIVE];

export const getPatientsList = createSelector(
  getPatientsById,
  (byId) => Object.keys(byId).map((id) => byId[id]),
);

export const getActivePatient = createSelector(
  getPatientsById,
  getActivePatientId,
  (byId, activeId) => (activeId !== null ? byId[activeId] || null : null),
);
