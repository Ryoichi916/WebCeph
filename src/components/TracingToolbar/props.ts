export interface StateProps {
  canAutoPlot: boolean;
  isAutoPlotting: boolean;
  /** Whether both reference points (Sella and Nasion) are placed. */
  canPlotFromReferences: boolean;
  /** Whether the profilogram overlay is currently shown. */
  isProfilogramShown: boolean;
  /** The id of the analysis active for the current image. */
  activeAnalysisId: string | null;
};

export interface DispatchProps {
  onAutoPlotClick(): any;
  onPlotFromReferencesClick(): any;
  onToggleProfilogramClick(): any;
  onSelectAnalysis(analysisId: string): any;
  onExportImage(format: 'png' | 'jpeg'): any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string | null;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
