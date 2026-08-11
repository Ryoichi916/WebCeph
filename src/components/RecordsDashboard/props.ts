import { PatientRecord } from 'store/reducers/workspace';

import { PatientDetails } from 'components/PatientFields';

import { RecordAnalysis } from './selectors';

export interface StateProps {
  /** The patient whose record is on screen. */
  patient: Patient | null;
  /** Every loaded image of the record, sorted by capture date. */
  records: PatientRecord[];
  /**
   * What each traceable film of the record reports, read-only, through the same
   * evaluation path the Summary dialog and the printed report use — one entry
   * per traceable film, in the records' own chronological order. See
   * `./selectors`.
   */
  analyses: RecordAnalysis[];
  /**
   * Chart IDs of every *other* patient, so correcting this patient's chart ID
   * cannot silently collide with another record.
   */
  otherChartIds: string[];
  /**
   * A rail tile that holds no image yet, if there is one. "Add image" lands on
   * it instead of creating a second empty tile beside it.
   */
  emptyWorkspaceId: string | null;
}

export interface DispatchProps {
  /** Leave the dashboard and return to the tracing editor. */
  onBackToEditor(): any;
  /** Open a record's image in the editor (switches to its rail tile). */
  onOpenRecord(record: PatientRecord): any;
  /**
   * Go to the upload screen: reuses the rail's ghost-tile path.
   *
   * `intent` is the record slot the upload is filing into — the type, timepoint
   * and day of the empty slot that was clicked — so the upload form opens already
   * filled in. Omitted (or null) for the undirected "Add image" buttons, which
   * also clears any slot chosen earlier.
   */
  onAddImage(emptyWorkspaceId: string | null, intent?: ImageRecordMeta | null): any;
  /** Correct the patient's own demographics (name, chart ID, DOB, sex). */
  onSavePatient(id: string, details: PatientDetails): any;
  /** Correct a record's type / timepoint / capture date. */
  onSaveRecordMeta(record: PatientRecord, meta: ImageRecordMeta): any;
  /**
   * Drop an image from the record. `fallbackWorkspaceId` is another record's
   * rail tile to land on when the removed image's tile goes away with it; null
   * keeps the (now empty) tile as the upload surface.
   */
  onRemoveRecord(record: PatientRecord, fallbackWorkspaceId: string | null): any;
}

export interface OwnProps {
  className?: string;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
