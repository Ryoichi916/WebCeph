import {
  connect,
  MapStateToProps,
  MapDispatchToPropsFunction,
} from 'react-redux';
import CommandPalette from './index';
import {
  StateProps,
  DispatchProps,
  OwnProps,
} from './props';
import { getCommands, PaletteCommand } from './commands';
import { isCommandPaletteOpen } from 'store/reducers/commandPalette';
import { getActivePatientId } from 'store/reducers/patients';
import { setCommandPaletteShown } from 'actions/commandPalette';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> = (state: StoreState) => {
  return {
    isOpen: isCommandPaletteOpen(state),
    commands: getCommands(),
    hasActivePatient: getActivePatientId(state) !== null,
  };
};

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> = (dispatch) => (
  {
    onClose: () => dispatch(setCommandPaletteShown({ isShown: false })),
    onOpen: () => dispatch(setCommandPaletteShown({ isShown: true })),
    onExecute: (command: PaletteCommand) => {
      dispatch(command.perform());
      dispatch(setCommandPaletteShown({ isShown: false }));
    },
  }
);

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(CommandPalette);


export default connected;
