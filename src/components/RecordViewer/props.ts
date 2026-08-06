import { PatientRecord } from 'store/reducers/workspace';

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
   * Every image of the open patient, oldest first — the record context shown
   * under the metadata so the other timepoints are one click away.
   */
  records: PatientRecord[];
}

export interface DispatchProps {
  onOpenRecordsClick(): any;
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
