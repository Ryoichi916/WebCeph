import { handleActions } from 'utils/store';

import omit from 'lodash/omit';

const KEY_PHOTO_REGISTRATION: StoreKey = 'images.photoRegistration';

/** A brand-new entry, before anything has been chosen or clicked. */
const emptyEntry = (): PhotoRegistration => ({
  cephImageId: '',
  points: {},
  isFlipped: false,
});

/**
 * The photo-overlay registrations of the open patient's profile photographs.
 * @see StoreEntries['images.photoRegistration']
 *
 * Every SET is a **partial merge**: the overlay view dispatches the ceph
 * choice, each clicked point and the facing toggle as they happen, and each
 * write lands on whatever the photograph already has (created with sensible
 * defaults when absent). The clicked points live in *photo* pixel
 * coordinates, so choosing a different ceph does not invalidate them and
 * deliberately leaves them in place.
 */
const reducers: Partial<ReducerMap> = {
  [KEY_PHOTO_REGISTRATION]: handleActions<typeof KEY_PHOTO_REGISTRATION>({
    SET_PHOTO_REGISTRATION_REQUESTED: (state, { payload }) => {
      const { imageId, cephImageId, point, isFlipped } = payload;
      const existing = state[imageId] !== undefined
        ? state[imageId]
        : emptyEntry();
      return {
        ...state,
        [imageId]: {
          cephImageId: cephImageId !== undefined
            ? cephImageId : existing.cephImageId,
          isFlipped: isFlipped !== undefined
            ? isFlipped : existing.isFlipped,
          points: point !== undefined
            ? {
              ...existing.points,
              [point.symbol]: { x: point.x, y: point.y },
            }
            : existing.points,
        },
      };
    },
    REMOVE_PHOTO_REGISTRATION_REQUESTED: (state, { payload: { imageId } }) => {
      if (state[imageId] === undefined) {
        return state;
      }
      return omit(state, imageId) as typeof state;
    },
    /**
     * Closing an image drops every registration it took part in — as the
     * photograph (the entry's own key) *or* as the ceph the overlay read from:
     * an entry pointing at a film no longer on file is a dangling reference,
     * and the next overlay opened on that photograph starts clean instead.
     */
    CLOSE_IMAGE_REQUESTED: (state, { payload: { imageId } }) => {
      const keys = Object.keys(state).filter(
        (photoId) => photoId === imageId ||
          state[photoId].cephImageId === imageId,
      );
      if (keys.length === 0) {
        return state;
      }
      return omit(state, keys) as typeof state;
    },
    /**
     * A loaded project's registrations replace whatever is in memory — and a
     * project saved before this key existed carries none, which must read as
     * "no registrations" rather than as the previous patient's still being
     * around. Same construction as the visit notes' loader.
     */
    LOAD_PROJECT_SUCCEEDED: (_, { payload }) => {
      const registrations = payload['images.photoRegistration'];
      return registrations !== undefined ? registrations : {};
    },
    // Leaving a patient takes their registrations with them.
    SET_ACTIVE_PATIENT_REQUESTED: () => ({}),
  }, {}),
};

export default reducers;

/** Every photo-overlay registration, keyed by photograph image id. */
export const getPhotoRegistrations = (state: StoreState) =>
  state[KEY_PHOTO_REGISTRATION] || {};
