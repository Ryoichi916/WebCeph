import { PaletteCommand } from './commands';

export interface StateProps {
  isOpen: boolean;
  commands: PaletteCommand[];
  /**
   * Whether there is a patient/workspace context for the palette's commands
   * to act on — @see index.tsx's document-level Ctrl+K listener for why this
   * gates opening rather than just being read at render time.
   */
  hasActivePatient: boolean;
}

export interface DispatchProps {
  onClose: () => void;
  onExecute: (command: PaletteCommand) => void;
  onOpen: () => void;
}

export interface OwnProps {
  className?: string;
}

export type ConnectableProps = StateProps & DispatchProps;

export type Props = ConnectableProps & OwnProps;

export default Props;
