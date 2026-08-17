import { CaseFileManifest } from 'utils/importers/wceph/v1/manifest';

/** Which half of the case file this dialog is doing, or nothing. */
export type CaseFileMode = 'export' | 'import' | null;

export interface StateProps {
  /** The chart the dialog is acting on, or null when nobody is registered. */
  patient: Patient | null;
  /**
   * What exporting *this chart, right now* would write — counted off the store
   * by `readManifestFromState`, so the dialog states the case rather than
   * promising a shape the file may not have.
   */
  manifest: CaseFileManifest;
  /** Whether a case file is being written at this moment. */
  isExporting: boolean;
  /** How far the writing has got, 0–100, or null when nothing is being written. */
  exportProgress: number | null;
  /**
   * The name the file was actually written under, or null.
   *
   * The whole point of the export half of this dialog: a browser download is a
   * silent act with no confirmation of its own, so the one thing that tells a
   * clinician the case left this device is being told the file's name.
   */
  exportedFileName: string | null;
  /** Why the last export failed, or null — printed verbatim in the dialog. */
  exportError: GenericError | null;
  /** Whether the file this dialog handed over is still being read in. */
  isImporting: boolean;
  /** Why reading it failed, or null. */
  importError: GenericError | null;
}

export interface DispatchProps {
  /** Write the whole chart out as one `.wceph`. */
  onExport(): any;
  /**
   * Read a case file into the open chart.
   *
   * `demographics` is the *fill-in-the-blanks* patch this dialog computed and
   * showed field by field — only the fields this chart leaves empty and the file
   * states, and null when there are none. It is carried **with** the import and
   * written only if the import lands (see
   * `Events['IMPORT_FILE_REQUESTED']#patientPatch`): it used to be dispatched
   * first and was never reversed, so a file that broke halfway through left the
   * chart carrying its date of birth and its sex although not one image had been
   * imported — and a date of birth is what all nine analyses index their
   * age-corrected norms by. Nothing already on file is ever overwritten.
   */
  onImport(file: File, demographics: Partial<Patient> | null): any;
}

export interface OwnProps {
  mode: CaseFileMode;
  onRequestClose(): any;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
