import { LandmarkMap } from 'analyses/superimposition';

export interface StateProps {
  patient: Patient | null;
  /** The film being simulated on. */
  src: string | null;
  width: number | null;
  height: number | null;
  /** mm per pixel, or null when this film has never been calibrated. */
  scaleFactor: number | null;
  /**
   * The landmarks actually plotted on this image. Read-only: the simulation
   * copies them and never writes back, so the tracing, its undo history, the
   * exports and the report are untouched by anything this view does.
   */
  landmarks: LandmarkMap;
  /** Free-text timepoint label of the film, when one was recorded. */
  timepoint: string | null;
  captureDate: string | null;
}

/** The view dispatches nothing at all — that is the point of it. */
export type DispatchProps = { };

export interface OwnProps {
  className?: string;
  imageId: string | null;
  onRequestClose(): any;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
