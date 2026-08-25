export interface StateProps {
  results: Array<CategorizedAnalysisResult<Category>>;
  /** The id of the active analysis (e.g. `downs`), used for the dialog badge. */
  analysisId: string | null;
  /**
   * Whose norms this analysis quotes, and on whom they were measured
   * (see `NormsProvenance`). A cephalometric norm is one author's sample
   * statistic, so a table of deviations that never names the sample invites
   * the reader to treat it as a definition of normal. `null` when the analysis
   * does not state one — in which case nothing is printed rather than a
   * guessed citation.
   */
  provenance: NormsProvenance | null;
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
  /**
   * The film's mm/px calibration and its pixel size, so the table can flag a
   * scale that cannot be right. The records dashboard already demotes such a
   * calibration to amber ("Calibrated · check scale / film 83 × 100 mm"); this
   * dialog reported millimetre values derived from the same number with no flag,
   * so one film carried two verdicts on its own scale.
   */
  scaleFactor: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /**
   * Warnings the analysis draws from its own values — a landmark its numbers
   * say is misplaced, not a finding about the patient (see `AnalysisCaveat`).
   * The rows named are marked in the table and the text prints under it.
   */
  caveats: AnalysisCaveat[];
  /**
   * The patient the norms were read against, so the provenance block can say
   * what this reading did with the record (an author's age correction applied,
   * or the reason none was). See `NormsProvenance.patientNote`.
   */
  analysisContext: AnalysisContext;
  /**
   * True when the demo/placeholder predictor (see `predictors/demo.ts`) has
   * plotted a landmark this reading depends on, on an image other than the
   * bundled sample cephalogram that predictor's template is calibrated
   * against — i.e. some of the values below are computed from a fabricated
   * position, not a real detection. @see store/reducers/workspace/predictorWarnings
   */
  isPlaceholderAutoPlot: boolean;
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
