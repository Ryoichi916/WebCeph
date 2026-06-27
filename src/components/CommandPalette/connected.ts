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

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> = (_state: StoreState) => {
  return {

  };
};

const mapDispatchToProps: MapDispatchToPropsFunction<DispatchProps, OwnProps> = (_dispatch) => (
  {

  }
);

const connected = connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps, mapDispatchToProps,
)(CommandPalette);


export default connected;
