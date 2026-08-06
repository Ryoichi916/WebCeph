export interface StateProps {
  results: Array<CategorizedAnalysisResult<Category>>;
  /** The id of the active analysis (e.g. `downs`), used for the dialog badge. */
  analysisId: string | null;
  /**
   * Landmark definitions of the active analysis keyed by symbol, so the
   * results table can show full measurement names and the correct units.
   */
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined };
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
