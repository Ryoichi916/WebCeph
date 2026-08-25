import {
  addNewWorkspace,
  toggleAnalysisResults,
  toggleProfilogram,
  setRecordsDashboardShown,
} from 'actions/workspace';
import { mintWorkspaceId } from 'utils/ids';

/**
 * One entry in the command palette's list.
 *
 * `label` is what is searched and shown; `keywords` are extra, unshown terms
 * a clinician might type instead of the label (an English term for a Japanese
 * label, an abbreviation) so the same command is found either way.
 */
export interface PaletteCommand {
  id: string;
  label: string;
  keywords?: string;
  perform: () => GenericAction;
}

/**
 * The palette's fixed command list.
 *
 * Kept to actions that are always safe to dispatch regardless of what is on
 * screen (no workspace- or selection-specific commands yet) — the same bar
 * `App/shortcuts.ts` holds its single global shortcut to.
 */
export const getCommands = (): PaletteCommand[] => [
  {
    id: 'ADD_NEW_WORKSPACE',
    label: 'Add new workspace',
    keywords: 'new tab create workspace',
    perform: () => addNewWorkspace({ id: mintWorkspaceId() }),
  },
  {
    id: 'TOGGLE_ANALYSIS_RESULTS',
    label: 'Toggle analysis results',
    keywords: 'show hide summary',
    perform: () => toggleAnalysisResults(void 0),
  },
  {
    id: 'TOGGLE_PROFILOGRAM',
    label: 'Toggle profilogram',
    keywords: 'show hide profile overlay',
    perform: () => toggleProfilogram(),
  },
  {
    id: 'OPEN_RECORDS_DASHBOARD',
    label: 'Open records dashboard',
    keywords: 'timeline history photos images',
    perform: () => setRecordsDashboardShown({ isShown: true }),
  },
];
