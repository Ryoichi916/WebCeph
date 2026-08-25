import { handleActions } from 'utils/store';

const KEY_IS_OPEN: StoreKey = 'commandPalette.isOpen';

const reducers: Partial<ReducerMap> = {
  [KEY_IS_OPEN]: handleActions<typeof KEY_IS_OPEN>({
    SET_COMMAND_PALETTE_SHOWN: (_, { payload: { isShown } }) => isShown,
    // Leaving the patient (or switching workspace) closes whatever transient
    // overlay was open over it, the same way the records dashboard does.
    SET_ACTIVE_PATIENT_REQUESTED: () => false,
  }, false),
};

export default reducers;

export const isCommandPaletteOpen = (state: StoreState) => state[KEY_IS_OPEN];
