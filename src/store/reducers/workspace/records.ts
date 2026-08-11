import { handleActions } from 'utils/store';

const KEY_DASHBOARD_SHOWN: StoreKey = 'records.dashboard.isShown';
const KEY_FILING_INTENT: StoreKey = 'records.filing.intent';

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
