import { PatientRecord } from 'store/reducers/workspace';

import { PatientDetails } from 'components/PatientFields';

export interface StateProps {
  /** Data URI of the image being viewed. */
  src: string | null;
  /** Original file name, if known. */
  name: string | null;
  type: ImageType | null;
  timepoint: string | null;
  /** ISO `YYYY-MM-DD`, or null when the capture date was not recorded. */
  captureDate: string | null;
  /** Natural pixel dimensions of the image. */
  width: number | null;
  height: number | null;
  /**
   * The patient this record belongs to, or null when none is open.
   *
   * The panel reads their date of birth to state the age *at this capture date* —
   * the number the record is read against, and the number the dashboard's own
   * group stamp carries for the same image ("AGE 12 y 3 m"). It is the whole
   * patient rather than that one field because a missing date of birth is a gap
   * this panel now closes, in the patient form, on the field it names.
   */
  patient: Patient | null;
  /**
   * Chart IDs of every *other* patient, so correcting this patient from here
   * cannot silently collide with another record (the dialog's own guard).
   */
  otherChartIds: string[];
  /**
   * Every image of the open patient, oldest first — the record context shown
   * under the metadata so the other timepoints are one click away.
   */
  records: PatientRecord[];
}

export interface DispatchProps {
  onOpenRecordsClick(): any;
  /**
   * Correct the patient's own demographics — the same action registration and
   * the records dashboard use, so the persistence middleware saves the corrected
   * patient exactly as it saved the original.
   */
  onSavePatient(id: string, details: PatientDetails): any;
  /** Switch the editor to another image of the same patient. */
  onOpenRecord(record: PatientRecord): any;
  /** Correct this image's type / timepoint / capture date. */
  onSaveMeta(meta: ImageRecordMeta): any;
  /** Drop this image from the record; see RecordsDashboard/props. */
  onRemoveRecord(record: PatientRecord, fallbackWorkspaceId: string | null): any;
}

export interface OwnProps {
  className?: string;
  imageId: string;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
