import { ManualLandmarks } from 'utils/tracingSnapshot';

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
  /** Manually placed/auto-plotted landmarks, for the tracing overlay. */
  manualLandmarks: ManualLandmarks;
  /** mm-per-pixel calibration, or null when the image is not calibrated. */
  scaleFactor: number | null;
  /**
   * True when the analysis interprets linear (mm) measurements that were
   * suppressed for want of an image scale. Their rows are absent from the
   * printed table, so a footnote accounts for them on the record.
   */
  needsScaleForLinear: boolean;
}

export interface DispatchProps {
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
