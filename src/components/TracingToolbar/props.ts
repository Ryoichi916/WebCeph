export interface StateProps {
  canAutoPlot: boolean;
  isAutoPlotting: boolean;
};

export interface DispatchProps {
  onAutoPlotClick(): any;
};

export type ConnectableProps = StateProps & DispatchProps;

export interface OwnProps {
  className?: string;
  imageId: string | null;
};

export type Props = ConnectableProps & OwnProps;

export default Props;
