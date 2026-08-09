import { handleActions } from 'utils/store';

const KEY_DASHBOARD_SHOWN: StoreKey = 'records.dashboard.isShown';

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
};

export default reducers;

export const isRecordsDashboardShown = (state: StoreState) =>
  state[KEY_DASHBOARD_SHOWN];
