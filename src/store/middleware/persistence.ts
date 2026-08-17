import { Store, Middleware } from 'redux';
import idb from 'idb-keyval';

import {
  persistStateStarted,
  persistStateSucceeded,
  persistStateFailed,
  restorePersistedStateSucceeded,
  restorePersistedStateFailed,
  persistStateUpgradeStarted,
  clearPersistedStateSucceeded,
  clearPersistedStateFailed,
} from 'actions/persistence';

import pickBy from 'lodash/pickBy';
import indexOf from 'lodash/indexOf';

import { isActionOfType } from 'utils/store';

const PERSISTABLE_EVENTS: ActionType[] = [
  'BROWSER_COMPATIBLITY_CHECK_SUCCEEDED',
  'BROWSER_COMPATIBLITY_CHECK_FAILED',
  'IGNORE_BROWSER_COMPATIBLITY_REQUESTED',
  'ENFORCE_BROWSER_COMPATIBLITY_REQUESTED',
  'FETCH_ANALYSIS_SUCCEEDED',
  'SET_USER_PREFERRED_LOCALE',
  'UNSET_USER_PREFERRED_LOCALE',
  'ADD_PATIENT_REQUESTED',
  'UPDATE_PATIENT_REQUESTED',
  'REMOVE_PATIENT_REQUESTED',
  // Not SET_ACTIVE_PATIENT_REQUESTED: the active patient is deliberately NOT a
  // persisted key (see `PERSISTABLE_KEYS`), so opening a case changed nothing in
  // the persisted subset — and still rewrote the whole blob, which now carries a
  // film thumbnail per case and runs to megabytes in a real practice. Opening one
  // case must not re-serialise every other case's thumbnail.
  // The trend board a case is followed on lives on the patient (see `Patient`),
  // so setting it has to reach the same store the demographics are saved to.
  'SET_PATIENT_TREND_PLOT_REQUESTED',
  // The case list's row for a patient (record count, last visit, tracing
  // progress, film thumbnail). Persisted with the patients themselves: the list
  // is the first surface of a launch, and it cannot re-derive these by reading
  // every saved project. @see PatientCaseSummary
  'SET_PATIENT_CASE_SUMMARY',
];

const isPersistenceNeededForAction = ({ type }: GenericAction): boolean => {
  return indexOf(PERSISTABLE_EVENTS, type) > -1;
};

const PERSISTABLE_KEYS: StoreKey[] = [
  'app.status.isInstalled',
  'env.compat.check.ignored',
  'env.compat.check.results',
  'analyses.lastUsedId',
  'user.preferences.preferredLocale',
  // Patient records persist; the active patient does not, so every launch
  // starts at the patient picker.
  'patients.byId',
  // …and what each of their saved projects holds, so the case list can be read,
  // sorted and filtered the moment it opens. @see PatientCaseSummary
  'patients.caseIndex',
];

import requestIdleCallback from 'utils/requestIdleCallback';

const isStoreEntryPersistable = (key: string): boolean => {
  return indexOf(PERSISTABLE_KEYS, key) > -1;
};

const saveStateMiddleware = (({ getState }: Store<StoreState>) => (next: GenericDispatch) =>
  async (action: GenericAction) => {
    if (isPersistenceNeededForAction(action)) {
      next(action);
      console.info(
        `Action ${action.type} has triggered state persistence`,
      );
      requestIdleCallback(async () => {
        try {
          next(persistStateStarted(void 0));
          console.info('Persisting state...');
          const stateToPersist = pickBy(
            getState(),
            (_, k) => isStoreEntryPersistable(k as string),
          );
          // @TODO: persist state along with app version
          await idb.set(__VERSION__, stateToPersist);
          console.info('State persisted successfully.');
          return next(persistStateSucceeded(void 0));
        } catch (e) {
          console.error(
            `Failed to persist state.`,
            e,
          );
          return next(persistStateFailed({ message: e.message }));
        }
      });
    } else {
      /**
       * Action does not trigger state
       * persistence, so it has been forwarded.
       */
      return next(action);
    }
  }) as Middleware;

type RestoredState = { [id: string]: any };

const loadStateMiddleware = ((_: Store<StoreState>) => (next: GenericDispatch) =>
  async (action: GenericAction) => {
    if (isActionOfType(action, 'LOAD_PERSISTED_STATE_REQUESTED')) {
      console.info('Requested loading persisted state');
      next(action);
      try {
        const keys = await idb.keys();
        let restoredState: RestoredState = { };
        if (keys.length === 0) {
          console.info('No persisted state was found.');
        } else if (indexOf(keys, __VERSION__) > -1) {
          console.info(`Found persisted state compatible with this version (${__VERSION__})`);
          restoredState = await idb.get<RestoredState>(__VERSION__);
        } else {
          console.info(
            `Could not find persisted state compatible with this ` +
            `version (${__VERSION__}). Upgrading...`,
          );
          next(persistStateUpgradeStarted(void 0));
          // @TODO: perform any necessary upgrade operations
          await idb.clear(); // @FIXME: Workaround
          // @NOTE: Do not break on switch cases.
          switch (__VERSION__) {
            default:
              restoredState = { };
          }
        }
        console.info('Persisted state loaded successfully');
        return next(restorePersistedStateSucceeded(restoredState));
      } catch (e) {
        console.error(
          `Failed to load persisted state.`,
          e,
        );
        return next(restorePersistedStateFailed({ message: e.message }));
      }
    } else {
      return next(action);
    }
  }) as Middleware;

const clearStateMiddleware = ((_: Store<StoreState>) => (next: GenericDispatch) =>
  async (action: GenericAction) => {
    if (isActionOfType(action, 'CLEAR_PRESISTED_STATE_SUCCEEDED')) {
      try {
        await idb.clear();
        return next(clearPersistedStateSucceeded(void 0));
      } catch (e) {
        console.error(
          `Failed to clean persisted state.`,
          e,
        );
        return next(clearPersistedStateFailed({ message: e.message }));
      }
    } else {
      return next(action);
    }
  }) as Middleware;

export { saveStateMiddleware, clearStateMiddleware, loadStateMiddleware };
