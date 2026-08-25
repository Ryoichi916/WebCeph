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
import { setCommandPaletteShown } from 'actions/commandPalette';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> = (state: StoreState) => {
  return {
    isOpen: isCommandPaletteOpen(state),
    commands: getCommands(),
  };
};

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> = (dispatch) => (
  {
    onClose: () => dispatch(setCommandPaletteShown({ isShown: false })),
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
