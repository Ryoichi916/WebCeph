export interface StateProps {
  activePatient: Patient | null;
  /** How many images are on file for the active patient. */
  recordCount: number;
}

export interface DispatchProps {
  onSave(): any;
  onChangePatient(): any;
  /** Open the patient records dashboard (timeline of every image). */
  onOpenRecords(): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
