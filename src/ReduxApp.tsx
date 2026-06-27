import * as React from 'react';
import { Provider } from 'react-redux';

import RootScreen from 'screens/root';
import createConfiguredStore from 'store';

export const store = createConfiguredStore();

export const ReduxApp = () => (
  <Provider store={store}>
    <RootScreen />
  </Provider>
);

export default ReduxApp;
