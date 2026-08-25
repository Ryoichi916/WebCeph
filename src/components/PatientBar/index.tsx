import * as React from 'react';

import FlatButton from 'material-ui/FlatButton';
import IconPerson from 'material-ui/svg-icons/social/person';
import IconSave from 'material-ui/svg-icons/content/save';
import IconSwap from 'material-ui/svg-icons/action/swap-horiz';
import IconSettings from 'material-ui/svg-icons/action/settings';
import IconRecords from 'material-ui/svg-icons/action/view-list';
import IconCommandPalette from 'material-ui/svg-icons/action/search';

import { Link } from 'react-router-dom';

import * as cx from 'classnames';

import Props from './props';

import { formatAgeFull, formatSexShort } from 'utils/patient';

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

// The Records control is a toggle: while the dashboard is the surface on screen
// it reads as pressed, and pressing it again returns to the editor.
const activeActionStyle: React.CSSProperties = {
  ...actionButtonStyle,
  backgroundColor: 'rgba(255, 255, 255, 0.20)',
};

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
    const {
      className, activePatient, recordCount, isRecordsShown,
      onSave, onChangePatient, onToggleRecords, onOpenCommandPalette,
    } = this.props;
    const name = activePatient !== null ?
      (activePatient.name || activePatient.chartId || '(unnamed)') : '—';
    const chartId = activePatient !== null && activePatient.name ?
      activePatient.chartId : null;
    const initials = activePatient !== null ?
      getInitials(activePatient.name || activePatient.chartId || '') : '';
    // Quiet demographics (e.g. "28 y 4 mo · F") — shown only when recorded.
    //
    // The *same* precision the records dashboard's identity band and every
    // report header print (`formatAgeFull`), not the list-row short form: the
    // bar read "16 y · F" while the identity band one Escape away read
    // "16 y 1 mo" for the same patient on the same day, which is one age stated
    // two ways rather than one age stated compactly.
    const demographics = activePatient !== null
      ? [
          formatAgeFull(activePatient.dateOfBirth),
          formatSexShort(activePatient.sex),
        ].filter((p) => p !== null).join(' · ')
      : '';
    return (
      <div className={cx(classes.root, className)}>
        <span className={classes.wordmark}>WebCeph</span>
        <span className={classes.divider} />
        {/* The patient identity is the entry point to their records: clicking
            it opens the dashboard listing every image on file. */}
        <button
          type="button"
          className={cx(classes.patient, {
            [classes.patient__active]: isRecordsShown,
          })}
          onClick={onToggleRecords}
          aria-pressed={isRecordsShown}
          title={isRecordsShown
            ? 'Return to the tracing editor'
            : `Open ${name}'s records`}
          aria-label={isRecordsShown
            ? 'Return to the tracing editor'
            : `Open patient records for ${name}`}
        >
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
          {/* While the records dashboard is the surface on screen, the identity
              band 40px below this bar owns the identity: it carries the chart ID
              as a pill and the demographics as labelled cells, in larger type.
              Repeated here, the same chart ID appeared twice inside 120 vertical
              pixels and the same age twice — the bar keeps the name, which is
              what labels this control and the way back to the editor. (Where the
              bar does print the age — on every other surface — it now prints it
              at the band's own precision, so leaving the dashboard cannot change
              the patient's age.) */}
          {chartId && !isRecordsShown ? (
            <span className={classes.chart_id}>{chartId}</span>
          ) : null}
          {demographics !== '' && !isRecordsShown ? (
            <span className={classes.demographics}>{demographics}</span>
          ) : null}
        </button>
        <span className={classes.spacer} />
        <div className={classes.actions}>
          <FlatButton
            label={recordCount > 0 ? `Records (${recordCount})` : 'Records'}
            style={isRecordsShown ? activeActionStyle : actionButtonStyle}
            labelStyle={actionLabelStyle}
            hoverColor="rgba(255, 255, 255, 0.12)"
            rippleColor="#FFFFFF"
            icon={<IconRecords color={iconWhite} style={actionIconStyle} />}
            onClick={onToggleRecords}
          />
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
          {/* The only mention anywhere in the app of Ctrl+K/Cmd+K — a clinician
              had no way to discover the Command Palette otherwise. Placed here,
              not in a menu: this bar is the one strip of chrome present on
              every workspace screen, the way the tracing toolbar's own icon
              buttons name their shortcut in `title` (@see "Undo (Ctrl+Z)").
              It only renders once a patient is active, which is also exactly
              the state the shortcut itself requires — so its mere presence
              never promises a shortcut that would not fire. */}
          <button
            type="button"
            className={classes.icon_button}
            title="Command Palette (Ctrl+K / Cmd+K)"
            aria-label="Open command palette"
            onClick={onOpenCommandPalette}
          >
            <IconCommandPalette color="#F2F5F8" style={{ width: 20, height: 20 }} />
          </button>
          <Link
            to="/settings"
            className={classes.icon_button}
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
