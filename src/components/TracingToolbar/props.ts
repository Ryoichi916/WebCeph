export interface StateProps {
  canAutoPlot: boolean;
  isAutoPlotting: boolean;
  /** Whether both reference points (Sella and Nasion) are placed. */
  canPlotFromReferences: boolean;
  /** Whether the profilogram overlay is currently shown. */
  isProfilogramShown: boolean;
  /** The id of the analysis active for the current image. */
  activeAnalysisId: string | null;
  /** Whether the analysis summary dialog can be shown for the current image. */
  canShowSummary: boolean;
  /** The user zoom factor (1 = fit to screen). */
  zoom: number;
  /** Whether there is a landmark edit that can be undone. */
  canUndo: boolean;
  /** Whether there is an undone landmark edit that can be reapplied. */
  canRedo: boolean;
};

export interface DispatchProps {
  onAutoPlotClick(): any;
  onPlotFromReferencesClick(): any;
  onToggleProfilogramClick(): any;
  onSelectAnalysis(analysisId: string): any;
  onExportImage(format: 'png' | 'jpeg'): any;
  onShowSummaryClick(): any;
  onZoomChange(zoom: number): any;
  onUndoClick(): any;
  onRedoClick(): any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string | null;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
