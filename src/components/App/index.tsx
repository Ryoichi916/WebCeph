import * as React from 'react';

import VerticalTabBar from 'components/VerticalTabBar/connected';
import PatientBar from 'components/PatientBar/connected';
import Workspace from 'components/Workspace/connected';
import Settings from 'components/Settings/connected';
import PatientPicker from 'components/PatientPicker/connected';
import RecordsDashboard from 'components/RecordsDashboard/connected';

import { Route } from 'react-router-dom';

import Progress from './Progress';

import getMuiTheme from 'material-ui/styles/getMuiTheme';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

import { compose, lifecycle, pure } from 'recompose';

import { IntlProvider } from 'react-intl';

import { getDirForLocale } from 'utils/locale';

import { defaultLocale } from 'utils/config';

import Props from './props';

type State = { };

const classes = require('./style.scss');

const addLifeCycleHooks = lifecycle({
  componentDidMount(this: React.Component<Props, { }>) {
    this.props.onComponentMount();
  },
  componentDidUpdate(this: React.Component<Props, { }>) {
    this.props.onComponentUpdate();
  },
});

const enhance = compose<Props, State>(pure, addLifeCycleHooks);

import { HotKeys } from 'react-hotkeys';
import { Helmet } from 'react-helmet';

const fontFamily = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Hiragino Sans"',
  '"Hiragino Kaku Gothic ProN"',
  '"Noto Sans JP"',
  'Meiryo',
  'sans-serif',
].join(', ');

const muiTheme = getMuiTheme({
  fontFamily,
  palette: {
    primary1Color: '#1565C0',
    primary2Color: '#10538F',
    primary3Color: '#A9B4BE',
    accent1Color: '#00897B',
    accent2Color: '#EDF0F4',
    accent3Color: '#7B8794',
    textColor: '#1F2933',
    secondaryTextColor: '#52616F',
    alternateTextColor: '#FFFFFF',
    canvasColor: '#FFFFFF',
    borderColor: '#DDE3EA',
    disabledColor: '#A9B4BE',
    pickerHeaderColor: '#1565C0',
    clockCircleColor: '#DDE3EA',
  },
  appBar: {
    height: 48,
    color: '#10538F',
  },
  toolbar: {
    backgroundColor: '#FFFFFF',
    height: 44,
  },
  flatButton: {
    primaryTextColor: '#1565C0',
  },
  raisedButton: {
    primaryColor: '#1565C0',
  },
});

const App = enhance(({
  isReady, keyMap, handlers,
  shouldShowWorkspaceSwitcher,
  hasActivePatient,
  activeWorkspaceId,
  title,
  locale, messages,
}: Props) => (
    <MuiThemeProvider muiTheme={muiTheme}>
      { isReady ? (
          <IntlProvider
            key={locale}
            defaultLocale={defaultLocale}
            locale={locale}
            messages={messages}
          >
            <div className={classes.root}>
              <Helmet
                htmlAttributes={{
                  lang: locale,
                  dir: getDirForLocale(locale),
                }}
                title={title ? `${title!} - WebCeph` : 'WebCeph'}
                defaultTitle="WebCeph"
              />
              <HotKeys keyMap={keyMap} handlers={handlers}>
                {hasActivePatient ? (
                  <div className={classes.container}>
                    {/* The top bar spans the full width so the left tab rail
                        tucks under it instead of colliding with its corner. */}
                    <PatientBar />
                    <div className={classes.row}>
                      {shouldShowWorkspaceSwitcher ? (
                        <VerticalTabBar
                          className={classes.tab_bar}
                        />
                      ) : null}
                      <Workspace className={classes.workspace} workspaceId={activeWorkspaceId} />
                    </div>
                    <RecordsDashboard />
                  </div>
                ) : (
                  <PatientPicker />
                )}
              </HotKeys>
              <Route path="/settings" component={Settings} />
            </div>
          </IntlProvider>
        ) : (
          <div className={classes.root_loading}>
            <Progress />
          </div>
        )
      }
    </MuiThemeProvider>
));

export default App as React.ComponentClass<Props>;
