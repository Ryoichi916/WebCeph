import * as React from 'react';
import Props from './props';

import Dialog from 'material-ui/Dialog';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';

import map from 'lodash/map';

import { supportedLocales } from 'utils/config';
import { getNativeNameForLocale, getPrimaryLang } from 'utils/locale';

import {
  injectIntl,
  InjectedIntl,
  defineMessages,
} from 'react-intl';

type InjectedIntlProps = {
  intl: InjectedIntl;
};

const messageDescriptors = defineMessages({
  label_language: {
    id: 'label_language',
    defaultMessage: 'Language',
  },
});

class Settings extends React.PureComponent<Props & InjectedIntlProps, { }> {
  handleLocaleChange = (_: any, __: number, value: string) => {
    if (value === 'auto') {
      this.props.onLocaleUnset();
    } else {
      this.props.onLocaleChange(value);
    }
  }

  render() {
    const languages = map(supportedLocales, (key) => {
      return {
        key,
        text: (
          getNativeNameForLocale(key) ||
          getNativeNameForLocale(getPrimaryLang(key)!) ||
          key
        ),
      };
    });
    const options = [
      { text: 'Auto', key: 'auto' },
      ...languages,
    ];
    const { intl: { formatMessage } } = this.props;
    return (
      <Dialog
        open
        title="Settings"
        contentStyle={{ maxWidth: 480 }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#52616F',
            }}
          >
            {formatMessage(messageDescriptors.label_language)}
          </label>
          <DropDownMenu
            value={this.props.currentUserPreferredLocale || 'auto'}
            onChange={this.handleLocaleChange}
            style={{ marginLeft: -24 }}
          >
            {map(options, ({ key, text }) => (
              <MenuItem key={key} value={key} primaryText={text} />
            ))}
          </DropDownMenu>
        </div>
      </Dialog>
    );
  }
}

export default injectIntl(Settings);
