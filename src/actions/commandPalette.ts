import { createActionCreator } from 'utils/store';

// Open or close the command palette overlay. @see components/CommandPalette
export const setCommandPaletteShown = createActionCreator('SET_COMMAND_PALETTE_SHOWN');
