export interface StateProps {
  canAutoPlot: boolean;
  isAutoPlotting: boolean;
  /** Whether both reference points (Sella and Nasion) are placed. */
  canPlotFromReferences: boolean;
  /** Whether the profilogram overlay is currently shown. */
  isProfilogramShown: boolean;
};

export interface DispatchProps {
  onAutoPlotClick(): any;
  onPlotFromReferencesClick(): any;
  onToggleProfilogramClick(): any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string | null;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
