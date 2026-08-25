import * as React from 'react';
import Props from './props';

import Dialog from 'material-ui/Dialog';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';
import FlatButton from 'material-ui/FlatButton';

import map from 'lodash/map';

import { supportedLocales } from 'utils/config';
import { getNativeNameForLocale, getPrimaryLang } from 'utils/locale';

import {
  injectIntl,
  InjectedIntl,
  defineMessages,
} from 'react-intl';

const classes = require('./style.scss');

type InjectedIntlProps = {
  intl: InjectedIntl;
};

const messageDescriptors = defineMessages({
  label_language: {
    id: 'label_language',
    defaultMessage: 'Language',
  },
});

/**
 * Application settings.
 *
 * It is a route that renders *over* whichever surface is beneath it, and it used
 * to be inescapable: a `<Dialog open>` with no `onRequestClose`, no actions row
 * and no close control, so neither the overlay nor Escape did anything and the
 * only way back to the patient's record was the browser's Back button. The way
 * out is now the dialog's own Close action, the overlay and Escape — all three
 * doing the one thing: leaving this address for the surface it was opened from.
 */
class Settings extends React.PureComponent<Props & InjectedIntlProps, { }> {
  handleLocaleChange = (_: any, __: number, value: string) => {
    if (value === 'auto') {
      this.props.onLocaleUnset();
    } else {
      this.props.onLocaleChange(value);
    }
  }

  /**
   * Leave `/settings` for whatever was on screen before it. Going *back* rather
   * than pushing a path is what keeps the surface underneath intact — the
   * records dashboard is store state with its own address, and replacing the
   * path here would close it (see components/RecordsRoute).
   */
  handleClose = () => {
    const { history } = this.props;
    if (history === undefined) {
      return;
    }
    if (history.length > 1) {
      history.goBack();
    } else {
      // Opened straight on `#/settings`: there is no entry to go back to.
      history.replace('/');
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
        modal={false}
        onRequestClose={this.handleClose}
        title={
          <div className={classes.title}>
            <h3 id="settings-dialog-title" className={classes.title_heading}>Settings</h3>
            <span className={classes.title_caption}>
              Preferences for this browser — no part of a patient's record
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="close"
            primary
            label="Close"
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            onClick={this.handleClose}
          />,
        ]}
        contentStyle={{ width: '92%', maxWidth: 480 }}
        bodyStyle={{ padding: '12px 24px 16px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{
          padding: '12px 24px', borderTop: '1px solid #DDE3EA',
        }}
        titleStyle={{ padding: '20px 24px 12px' }}
        paperProps={{
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'settings-dialog-title',
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        <div className={classes.field}>
          <span className={classes.field_label}>
            {formatMessage(messageDescriptors.label_language)}
          </span>
          <DropDownMenu
            value={this.props.currentUserPreferredLocale || 'auto'}
            onChange={this.handleLocaleChange}
            {...{ autoWidth: false }}
            style={{ width: 240, height: 40 }}
            // mui pads the label by a full desktop gutter (24px) and the old
            // code cancelled it with `marginLeft: -24` on the control itself,
            // which dragged the whole menu — underline included — out of the
            // dialog's 24px text column. The padding is removed where it is
            // added instead.
            labelStyle={{
              paddingLeft: 0,
              paddingRight: 40,
              height: 40,
              lineHeight: '40px',
              fontSize: 14,
              color: '#1F2933',
            }}
            iconStyle={{ right: 0, top: 0 }}
            underlineStyle={{ margin: 0, borderTopColor: '#C3CCD6' }}
          >
            {map(options, ({ key, text }) => (
              <MenuItem key={key} value={key} primaryText={text} />
            ))}
          </DropDownMenu>
          <p className={classes.hint}>
            “Auto” follows the language your browser asks for. The choice is kept
            on this device.
          </p>
        </div>
      </Dialog>
    );
  }
}

export default injectIntl(Settings);
