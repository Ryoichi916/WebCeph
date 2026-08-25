import { addNewWorkspace } from 'actions/workspace';

import mapValues from 'lodash/mapValues';
import { mintWorkspaceId } from 'utils/ids';

export const keyboardActions: KeyboardActionCreators = {
  ADD_NEW_WORKSPACE: () => addNewWorkspace({ id: mintWorkspaceId() }),
};

export const keyMap: KeyboardMap = {
  ADD_NEW_WORKSPACE: 'n',
};

// Command Palette's Ctrl+K/Cmd+K used to be bound here too, through
// react-hotkeys like everything else in this map. It was moved to a
// document-level listener owned by `components/CommandPalette/index.tsx`
// instead, for a reason specific to that one shortcut: this `keyMap` only
// ever reaches keys pressed *inside* the `<HotKeys>` subtree in `App/index`,
// which (a) does not exist at all until a patient is active, and (b) even
// once it exists, only actually catches a keystroke once DOM focus has moved
// somewhere inside it — react-hotkeys does not focus it for you. Right after
// registering the very first patient, focus is still on `document.body`, so
// Ctrl+K silently did nothing, with no feedback, until the clinician
// happened to click something inside the workspace first. A listener on
// `document` itself has no such blind spot.

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
 *
 * Exported: `components/CommandPalette/index.tsx`'s own document-level
 * Ctrl+K listener (@see the note above `keyMap`) needs the same guard.
 */
export const isFromEditable = (e: KeyboardEvent): boolean => {
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
