import { handleActions } from 'utils/store';
import { createSelector } from 'reselect';
import omit from 'lodash/omit';

const KEY_BY_ID: StoreKey = 'patients.byId';
const KEY_ACTIVE: StoreKey = 'patients.activeId';

const reducers: Partial<ReducerMap> = {
  [KEY_BY_ID]: handleActions<typeof KEY_BY_ID>(
    {
      ADD_PATIENT_REQUESTED: (state, { payload: { id, name, chartId } }) => ({
        ...state,
        [id]: { id, name, chartId },
      }),
      UPDATE_PATIENT_REQUESTED: (state, { payload: { id, name, chartId } }) => ({
        ...state,
        [id]: { id, name, chartId },
      }),
      REMOVE_PATIENT_REQUESTED: (state, { payload: { id } }) =>
        omit(state, id) as typeof state,
    },
    {},
  ),
  [KEY_ACTIVE]: handleActions<typeof KEY_ACTIVE>(
    {
      // A newly added patient becomes the active one.
      ADD_PATIENT_REQUESTED: (_, { payload: { id } }) => id,
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
