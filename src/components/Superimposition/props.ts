import {
  LandmarkMap,
  RegistrationBasisId,
} from 'analyses/superimposition';

/**
 * One timepoint the superimposition can use: an image of the open patient that
 * is traceable and actually carries enough of a tracing to be registered.
 * Everything here is read off existing state — nothing is inferred.
 */
export interface TimepointRecord {
  imageId: string;
  /** Free-text timepoint label (T1, T2, "pre-treatment"…), or null. */
  timepoint: string | null;
  type: ImageType | null;
  /** ISO `YYYY-MM-DD`, or null when the capture date was not recorded. */
  captureDate: string | null;
  /** Original file name, if known. */
  name: string | null;
  /** Data URI of the film — used dimmed, as context, when this is T1. */
  src: string | null;
  width: number | null;
  height: number | null;
  /** mm per pixel, or null when this film has never been calibrated. */
  scaleFactor: number | null;
  /** Landmarks placed on this image. */
  landmarks: LandmarkMap;
  /** Registrations this tracing on its own can supply. */
  availableBasisIds: RegistrationBasisId[];
}

export interface StateProps {
  patient: Patient | null;
  /**
   * Every image of the patient that can take part in a superimposition, oldest
   * capture date first. Two or more of these is what enables the feature.
   */
  timepoints: TimepointRecord[];
}

/** The view dispatches nothing: it reads the record and renders it. */
export type DispatchProps = { };

export interface OwnProps {
  className?: string;
  onRequestClose(): any;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
