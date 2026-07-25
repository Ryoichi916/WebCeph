export interface StateProps {
  canAutoPlot: boolean;
  isAutoPlotting: boolean;
  /** Whether both reference points (Sella and Nasion) are placed. */
  canPlotFromReferences: boolean;
};

export interface DispatchProps {
  onAutoPlotClick(): any;
  onPlotFromReferencesClick(): any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string | null;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
