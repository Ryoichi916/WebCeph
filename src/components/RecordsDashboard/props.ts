import { PatientRecord } from 'store/reducers/workspace';

import { PatientDetails } from 'components/PatientFields';

import { RecordAnalysis, RecordLaunch } from './selectors';
import { PhotoOverlayAvailability } from 'components/PhotoOverlay/selectors';

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
   * Whether the patient's profile photographs can launch the ceph overlay —
   * one answer for the whole record (the overlay needs *a* traced ceph
   * carrying Pn and Pog′, whichever photograph it is opened on), with the
   * sentence that explains it when they cannot.
   * @see components/PhotoOverlay/selectors#getPhotoOverlayAvailability
   */
  overlay: PhotoOverlayAvailability;
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
  /**
   * The written half of the record: one clinical note per visit, keyed by the
   * visit's timepoint label (@see StoreEntries['records.notes']). Read through
   * `utils/visitNotes` — the dashboard never indexes a note's versions itself.
   */
  notes: { [timepointKey: string]: VisitNote };
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
  /**
   * File a reviewed batch of photographs into the record — one entry per
   * photograph, each carrying the record details the filing dialog showed (its
   * frame, the type that frame belongs to, the visit and the visit's day).
   *
   * The point of it is that it does **not** navigate. A nine-frame photographic
   * series was nine separate full-page uploads, each of which left the records
   * dashboard for the upload screen and landed in the record viewer, so the empty
   * cell's own act threw the clinician off the surface they pressed it on — nine
   * times for one sitting's photographs. This files the whole sitting with the
   * dashboard still on screen; the images appear on the visit's tile as they load.
   *
   * `emptyWorkspaceId` is the rail's already-empty tile, used for the first
   * photograph so a blank tile is not left stranded beside the batch.
   */
  onAddPhotographs(
    emptyWorkspaceId: string | null,
    entries: Array<{ file: File; meta: ImageRecordMeta }>,
  ): any;
  /**
   * Put the workspace behind this surface back onto a record of this chart,
   * without leaving the surface.
   *
   * A photographic batch is the reason it exists. Every photograph of a sitting
   * is filed onto a rail tile of its own, and the tile that ends up active after
   * the batch was an empty one — so Esc from a fully-populated twelve-image chart
   * landed on "To start tracing, drop a cephalogram or photograph here", which
   * tells a clinician looking at twelve filed images that the chart is empty.
   * Called once the batch has settled with the film the visit itself holds (or,
   * failing that, the chart's most recent record), so the surface behind the
   * dashboard is always something the chart actually holds.
   */
  onRestoreActiveRecord(record: PatientRecord): any;
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
  /**
   * Write or amend a visit's clinical note. `timepoint` is the visit's note key
   * (@see utils/visitNotes#getVisitNoteKey).
   *
   * Always an append: the entry on file is kept and the new version is dated, so
   * an amended note can be read as it stands *and* as it stood. Nothing in this
   * component or its dispatch can remove a version.
   */
  onSaveVisitNote(timepoint: string, fields: VisitNoteFields): any;
  /**
   * Move a note — with its whole amendment trail — onto the visit it belongs to,
   * for an entry left pointing at a label no image carries any more (see
   * `UnmatchedVisitNotes`). Never offered towards a visit that already holds a
   * note.
   */
  onRefileVisitNote(from: string, to: string): any;
}

export interface OwnProps {
  className?: string;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
