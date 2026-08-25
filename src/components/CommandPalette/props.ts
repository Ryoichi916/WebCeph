import { PaletteCommand } from './commands';

export interface StateProps {
  isOpen: boolean;
  commands: PaletteCommand[];
}

export interface DispatchProps {
  onClose: () => void;
  onExecute: (command: PaletteCommand) => void;
}

export interface OwnProps {
  className?: string;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
