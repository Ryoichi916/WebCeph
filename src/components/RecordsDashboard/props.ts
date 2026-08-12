import { PatientRecord } from 'store/reducers/workspace';

import { PatientDetails } from 'components/PatientFields';

import { RecordAnalysis, RecordLaunch } from './selectors';

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
   * What each traceable film can launch — its clinical report, a treatment
   * simulation, one half of a superimposition — and the sentence that explains
   * every one it cannot. Keyed by image id; films that can never be traced are
   * absent. See `./selectors#getRecordLaunch`.
   */
  launch: { [imageId: string]: RecordLaunch | undefined };
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
   * Write one film's mm/px calibration onto other films of the same record — the
   * reviewed half of `ApplyScaleDialog`, which is the only thing that calls it.
   *
   * A scale is a property of the machine and the export, so three cephs from one
   * cephalostat share one; calibrating each by hand was three chances to mis-mark
   * the ruler. The dialog names every film and the exact factor before this runs,
   * and only films carrying **no** scale are ever offered — an existing
   * calibration is a measurement someone made, and this must not overwrite one.
   *
   * `sourceImageId` is the film the number was measured on, and it is stored with
   * the number on every film it lands on (`SET_SCALE_FACTOR_REQUESTED`): it is what
   * lets the record itself say which of its scales were measured and which were
   * copied, and what lets the batched reversal be offered for as long as the copies
   * are on file rather than until the next navigation.
   */
  onApplyScale(
    imageIds: string[], scaleFactor: number, sourceImageId: string,
  ): any;
  /**
   * Take a batched calibration back off the films it was written onto — the same
   * dispatch the tracing toolbar's own "Remove calibration" makes, once per film.
   *
   * The mirror of `onApplyScale`, and it exists for the same reason: one press
   * writes a scale onto N films, and until now the only way back was N trips into
   * N editors. Reviewed through the same list before anything is cleared, and only
   * ever offered for the films that press wrote to (see
   * `RecordsDashboard#appliedFrom`) — this never touches a calibration someone
   * made on the film itself.
   */
  onRemoveScale(imageIds: string[]): any;
  /**
   * Drop an image from the record. `fallbackWorkspaceId` is another record's
   * rail tile to land on when the removed image's tile goes away with it; null
   * keeps the (now empty) tile as the upload surface.
   */
  onRemoveRecord(record: PatientRecord, fallbackWorkspaceId: string | null): any;
  /**
   * Set which measurements this patient's trend board plots — null puts it back
   * on the chart's own defaults. Filed on the patient, so the three or four
   * values a case is being followed on are still the ones on screen the next
   * morning (see `TrendChart`).
   */
  onSetTrendPlot(patientId: string, symbols: string[] | null): any;
}

export interface OwnProps {
  className?: string;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
