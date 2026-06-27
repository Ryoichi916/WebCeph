import { Store, Dispatch, Middleware } from 'redux';

import { getLocaleToFetch } from 'store/reducers/locale';

import { isActionOfType } from 'utils/store';

import { getPrimaryLang } from 'utils/locale';

import { addLocaleData } from 'react-intl';

import {
  fetchLocaleStarted,
  fetchLocaleFailed,
  fetchLocaleSucceeded,
} from 'actions/env';

import some from 'lodash/some';

const observedActions: ActionType[] = [
  'ENV_LOCALES_CHANGED',
  'SET_USER_PREFERRED_LOCALE',
  'LOAD_PERSISTED_STATE_SUCCEEDED',
];

declare const require: __WebpackModuleApi.RequireFunction;

const requireLang = require.context(`react-intl/locale-data`, false, /\.js$/);

const addReactIntlData = (locale: string) => {
  const primaryLang = getPrimaryLang(locale);
  return new Promise<void>((resolve, reject) => {
    require.ensure([], () => {
      try {
        const data = requireLang(`./${primaryLang}.js`) as ReactIntl.Locale;
        console.info(`Locale data fetched for ${locale}`);
        addLocaleData(data);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
};

const middleware = ({ getState }: Store<StoreState>) =>
  (next: Dispatch<GenericAction>) => async (action: GenericAction) => {
    next(action);
    if (some(observedActions, (type) => isActionOfType(action, type))) {
      const state = getState();
      const locale = getLocaleToFetch(state);
      if (locale !== undefined) {
        next(fetchLocaleStarted(locale));
        try {
          const [ localeModule ] = await Promise.all([
            import(/* webpackChunkName: "locale" */ `locale/${locale}.json`),
            addReactIntlData(locale),
          ]);
          const messages = (localeModule as { default: Locale }).default;
          next(fetchLocaleSucceeded({ locale, messages }));
        } catch (error) {
          next(fetchLocaleFailed({ locale, error }));
        }
      }
    }
  };

export default middleware as Middleware;
