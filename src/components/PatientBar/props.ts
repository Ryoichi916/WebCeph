export interface StateProps {
  patients: Patient[];
  activePatient: Patient | null;
}

export interface DispatchProps {
  onAdd(name: string, chartId: string): any;
  onSelect(id: string | null): any;
  onRemove(id: string): any;
}

export interface OwnProps {
  className?: string;
}

export type Props = StateProps & DispatchProps & OwnProps;

export default Props;
