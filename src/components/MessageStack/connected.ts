import {
  connect,
  MapStateToProps,
} from 'react-redux';
import MessageStack from './index';
import { StateProps, OwnProps } from './props';

const mapStateToProps: MapStateToProps<StateProps, OwnProps, StoreState> =
  (_state: StoreState): StateProps => {
    return {
      messages: [
        { id: 'update-status', text: 'App is updating...' },
      ],
    };
  };

export default connect(mapStateToProps)(MessageStack);
