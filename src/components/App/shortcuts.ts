import { addNewWorkspace } from 'actions/workspace';
import { setCommandPaletteShown } from 'actions/commandPalette';

import mapValues from 'lodash/mapValues';
import { mintWorkspaceId } from 'utils/ids';

export const keyboardActions: KeyboardActionCreators = {
  ADD_NEW_WORKSPACE: () => addNewWorkspace({ id: mintWorkspaceId() }),
  OPEN_COMMAND_PALETTE: () => setCommandPaletteShown({ isShown: true }),
};

export const keyMap: KeyboardMap = {
  ADD_NEW_WORKSPACE: 'n',
  OPEN_COMMAND_PALETTE: ['ctrl+k', 'command+k'],
};

/**
 * Whether a keystroke came from somewhere the user is *writing*, in which case
 * it is a letter and not a shortcut.
 *
 * `n` is a bare, unmodified letter, and react-hotkeys only excuses `<input>`,
 * `<textarea>` and `<select>` from it. The app's editable letterhead fields are
 * `contentEditable` spans (the clinical report's masthead and certification
 * block, and the same field on the records sheet), so every `n` typed into a
 * practice name was swallowed *and* silently opened a new workspace: "Midori
 * Dental & Orthodontic Clinic" was stored as "Midori Detal & Orthodotic Cliic".
 * A field that drops letters out of the practice's own name cannot be allowed to
 * head a document filed in a chart.
 */
const isFromEditable = (e: KeyboardEvent): boolean => {
  const target = e.target as HTMLElement | null;
  if (target === null || target === undefined) {
    return false;
  }
  const tag = (target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    target.isContentEditable === true;
};

export const createHandlers = (dispatch: GenericDispatch): KeyboardHandlers => {
  return mapValues(
    keyboardActions,
    (actionCreator) => (e: KeyboardEvent) => {
      if (isFromEditable(e)) {
        // Not a shortcut — a letter of what is being typed. Left to the field,
        // unprevented, so it reaches the text.
        return;
      }
      dispatch(actionCreator());
      e.stopPropagation();
      e.preventDefault();
    },
  ) as KeyboardHandlers;
};
