import * as React from 'react';

import FlatButton from 'material-ui/FlatButton';
import IconPerson from 'material-ui/svg-icons/social/person';
import IconSave from 'material-ui/svg-icons/content/save';
import IconSwap from 'material-ui/svg-icons/action/swap-horiz';
import IconSettings from 'material-ui/svg-icons/action/settings';

import { Link } from 'react-router-dom';

import * as cx from 'classnames';

import Props from './props';

const classes = require('./style.scss');

const actionButtonStyle: React.CSSProperties = {
  height: 32,
  lineHeight: '32px',
  minWidth: 0,
  borderRadius: 6,
  color: '#FFFFFF',
};

const actionLabelStyle: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.95)',
  fontSize: 13,
  fontWeight: 500,
  textTransform: 'none',
  paddingLeft: 8,
  paddingRight: 12,
  verticalAlign: 'middle',
};

const actionIconStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  marginLeft: 10,
  verticalAlign: 'middle',
};

const iconWhite = 'rgba(255, 255, 255, 0.9)';

/**
 * Initials for the avatar chip: first character for CJK names (e.g. 山田 太郎
 * → 山), first letter of the first two words otherwise (John Smith → JS).
 */
const getInitials = (text: string): string => {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return '';
  }
  if (/[　-〿぀-ヿ㐀-鿿豈-﫿]/.test(tokens[0])) {
    return tokens[0].charAt(0);
  }
  return tokens.slice(0, 2).map((t) => t.charAt(0).toUpperCase()).join('');
};

export default class PatientBar extends React.PureComponent<Props, { }> {
  render() {
    const { className, activePatient, onSave, onChangePatient } = this.props;
    const name = activePatient !== null ?
      (activePatient.name || activePatient.chartId || '(unnamed)') : '—';
    const chartId = activePatient !== null && activePatient.name ?
      activePatient.chartId : null;
    const initials = activePatient !== null ?
      getInitials(activePatient.name || activePatient.chartId || '') : '';
    return (
      <div className={cx(classes.root, className)}>
        <span className={classes.wordmark}>WebCeph</span>
        <span className={classes.divider} />
        <div className={classes.patient}>
          {initials !== '' ? (
            <span className={classes.patient_avatar} aria-hidden="true">
              {initials}
            </span>
          ) : (
            <span className={classes.patient_icon}>
              <IconPerson color={iconWhite} style={{ width: 16, height: 16 }} />
            </span>
          )}
          <span className={classes.patient_name} title={name}>{name}</span>
          {chartId ? (
            <span className={classes.chart_id}>{chartId}</span>
          ) : null}
        </div>
        <span className={classes.spacer} />
        <div className={classes.actions}>
          <FlatButton
            label="Save project"
            style={actionButtonStyle}
            labelStyle={actionLabelStyle}
            hoverColor="rgba(255, 255, 255, 0.12)"
            rippleColor="#FFFFFF"
            icon={<IconSave color={iconWhite} style={actionIconStyle} />}
            onClick={onSave}
          />
          <FlatButton
            label="Change patient"
            style={actionButtonStyle}
            labelStyle={actionLabelStyle}
            hoverColor="rgba(255, 255, 255, 0.12)"
            rippleColor="#FFFFFF"
            icon={<IconSwap color={iconWhite} style={actionIconStyle} />}
            onClick={onChangePatient}
          />
          <Link
            to="/settings"
            className={classes.settings_link}
            aria-label="Settings"
          >
            {/* mui SvgIcon resolves `currentColor` against its own inline
                `color: palette.textColor`, which renders near-black on the
                blue bar — pass the on-dark white explicitly instead. */}
            <IconSettings color="#F2F5F8" style={{ width: 20, height: 20 }} />
          </Link>
        </div>
      </div>
    );
  }
}
