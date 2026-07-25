export interface StateProps {
  patients: Patient[];
}

export interface DispatchProps {
  onRegister(name: string, chartId: string): any;
  onOpen(id: string): any;
  onRemove(id: string): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
