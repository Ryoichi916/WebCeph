import { handleActions } from 'utils/store';

const KEY_DASHBOARD_SHOWN: StoreKey = 'records.dashboard.isShown';

const reducers: Partial<ReducerMap> = {
  [KEY_DASHBOARD_SHOWN]: handleActions<typeof KEY_DASHBOARD_SHOWN>({
    SET_RECORDS_DASHBOARD_SHOWN: (_, { payload: { isShown } }) => isShown,
    // Leaving the patient closes their record view; the next patient opens on
    // the editor, not on someone else's timeline.
    SET_ACTIVE_PATIENT_REQUESTED: () => false,
  }, false),
};

export default reducers;

export const isRecordsDashboardShown = (state: StoreState) =>
  state[KEY_DASHBOARD_SHOWN];
