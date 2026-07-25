export interface StateProps {
  activePatient: Patient | null;
}

export interface DispatchProps {
  onSave(): any;
  onChangePatient(): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
