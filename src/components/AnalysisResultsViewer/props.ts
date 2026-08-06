export interface StateProps {
  results: Array<CategorizedAnalysisResult<Category>>;
  /** The id of the active analysis (e.g. `downs`), used for the dialog badge. */
  analysisId: string | null;
  /**
   * Record identity of the film these results belong to — the timepoint label
   * and the capture date. With T1/T2 on file a bare "Analysis summary · Downs"
   * cannot be tied to a radiograph.
   */
  timepoint: string | null;
  captureDate: string | null;
  /**
   * Landmark definitions of the active analysis keyed by symbol, so the
   * results table can show full measurement names and the correct units.
   */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
  /**
   * True when the analysis interprets linear (mm) measurements that were
   * suppressed because the image has no scale. Their rows are absent from the
   * table, so a footnote explains the gap rather than letting it pass silently.
   */
  needsScaleForLinear: boolean;
};

export interface DispatchProps {
  onRequestClose(): any;
}

export type ConnectableProps = StateProps & DispatchProps;

export type OwnProps = {
  open: boolean;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
