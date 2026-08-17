export interface StateProps {
  activePatient: Patient | null;
  /** How many images are on file for the active patient. */
  recordCount: number;
  /** Whether the records dashboard is the surface currently on screen. */
  isRecordsShown: boolean;
}

export interface DispatchProps {
  onSave(): any;
  onChangePatient(): any;
  /**
   * Toggle the patient records dashboard: open it over the editor, or — when it
   * is already the surface on screen — go back to the editor.
   */
  onToggleRecords(): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
