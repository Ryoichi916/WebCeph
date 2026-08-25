import { ManualLandmarks } from 'utils/tracingSnapshot';

import { VisitNoteReading } from 'utils/visitNotes';

export interface StateProps {
  /** The active patient record (name + chart id), or null if none is open. */
  patient: Patient | null;
  /** Categorized results of the active analysis, as shown in the Summary. */
  results: Array<CategorizedAnalysisResult<Category>>;
  /** The id of the active analysis (e.g. `downs`). */
  analysisId: string | null;
  /**
   * Landmark definitions of the active analysis keyed by symbol, for full
   * measurement names and units — same shape as the Summary dialog uses.
   */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /** Data URL of the radiograph, for the traced-image snapshot. */
  imageSrc: string | null;
  /** Natural pixel dimensions of the radiograph. */
  imageWidth: number | null;
  imageHeight: number | null;
  /** The image type (e.g. `ceph_lateral`), for the snapshot caption. */
  imageType: ImageType | null;
  /**
   * Record identity of the film being reported on: its timepoint label and its
   * ISO capture date. Both print in the patient band, and the capture date is
   * what the stated age is computed against.
   */
  timepoint: string | null;
  captureDate: string | null;
  /**
   * The clinical note recorded for the **visit this film belongs to**, read back
   * with its amendment trail, or null when the visit has none.
   *
   * The report's "Clinical notes & plan" area was ruled lines and nothing else:
   * the clinician's own statement of the case existed nowhere in the app, so the
   * document that goes out to a referrer carried the app's ninety-one measurements
   * and none of the practice's own words. Where an entry is on file it is printed
   * here — the same entry the records sheet prints, from the same store — and the
   * ruled lines stay for what is added by hand.
   *
   * Looked up by timepoint, not by image: the note is a fact about the visit (@see
   * VisitNote), and every film of that visit reports the same one.
   */
  visitNote: VisitNoteReading | null;
  /** Manually placed/auto-plotted landmarks, for the tracing overlay. */
  manualLandmarks: ManualLandmarks;
  /** mm-per-pixel calibration, or null when the image is not calibrated. */
  scaleFactor: number | null;
  /**
   * Where the scale came from, when it was copied from another film of this
   * record rather than measured on this one — null when it was measured here,
   * when the film has no scale, or when the source has since been
   * recalibrated to a different factor (see `connected.ts#getScaleCopiedFrom`).
   * A signed report may not state a distance as measured on this radiograph
   * when it was never measured on it at all.
   */
  scaleCopiedFrom: { label: string; captureDate: string | null } | null;
  /**
   * True when the analysis interprets linear (mm) measurements that were
   * suppressed for want of an image scale. Their rows are absent from the
   * printed table, so a footnote accounts for them on the record.
   */
  needsScaleForLinear: boolean;
}

export interface DispatchProps {
  /**
   * Plots the named landmarks if they are not placed yet — the same completion
   * pass the analysis switch runs, invoked by the report for the *union* of
   * every analysis it prints. Without it, "All analyses" reported whichever
   * analyses happened to share the open analysis' landmarks and quietly
   * truncated the rest (see `index.tsx#ensureLandmarksForAllAnalyses`).
   */
  onPlotMissingLandmarks(symbols: string[]): any;
}

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  /** The id of the image being reported on. */
  imageId: string | null;
  /** Closes the report view (Close button, Escape, backdrop click). */
  onRequestClose(): any;
}

export type Props = ConnectableProps & OwnProps;

export default Props;
