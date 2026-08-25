import { EligibleCeph } from './selectors';

export interface StateProps {
  patient: Patient | null;
  /** The photograph being overlaid. */
  src: string | null;
  width: number | null;
  height: number | null;
  /** The photograph's own record facts, for the identity line and cautions. */
  timepoint: string | null;
  captureDate: string | null;
  /**
   * The patient's traced cephs the overlay can read from — every traceable
   * film carrying both Pn and Pog′, oldest first. @see ./selectors
   */
  cephs: EligibleCeph[];
  /**
   * This photograph's stored registration (clicked points, chosen ceph,
   * facing), or null before the first interaction. Part of the project, so it
   * survives a reload. @see StoreEntries['images.photoRegistration']
   */
  registration: PhotoRegistration | null;
}

export interface DispatchProps {
  /**
   * Write part of the registration — a partial merge; the reducer creates the
   * entry when it is absent. @see SET_PHOTO_REGISTRATION_REQUESTED
   */
  onSetRegistration(payload: Events['SET_PHOTO_REGISTRATION_REQUESTED']): any;
  /** Drop the registration entirely — the view's "Start over". */
  onRemoveRegistration(imageId: string): any;
}

export interface OwnProps {
  className?: string;
  /** The photograph's image id. */
  imageId: string;
  onRequestClose(): any;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
