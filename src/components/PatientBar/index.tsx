import * as React from 'react';

import FlatButton from 'material-ui/FlatButton';
import IconPerson from 'material-ui/svg-icons/social/person';
import IconSave from 'material-ui/svg-icons/content/save';
import IconSwap from 'material-ui/svg-icons/action/swap-horiz';

import Props from './props';

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '2px 10px',
  background: '#0b3c8c',
  color: 'white',
  fontSize: '14px',
  flexShrink: 0,
};

const white = { color: 'white' };

export default class PatientBar extends React.PureComponent<Props, { }> {
  private label(patient: Patient): string {
    if (patient.name && patient.chartId) {
      return `${patient.name} (${patient.chartId})`;
    }
    return patient.name || patient.chartId || '(unnamed)';
  }

  render() {
    const { className, activePatient, onSave, onChangePatient } = this.props;
    return (
      <div className={className} style={barStyle}>
        <IconPerson color="white" style={{ width: 18, height: 18 }} />
        <span style={{ fontWeight: 600 }}>Patient:</span>
        <span>{activePatient ? this.label(activePatient) : '—'}</span>
        <span style={{ flexGrow: 1 }} />
        <FlatButton
          label="Save project"
          labelStyle={white}
          icon={<IconSave color="white" />}
          onClick={onSave}
        />
        <FlatButton
          label="Change patient"
          labelStyle={white}
          icon={<IconSwap color="white" />}
          onClick={onChangePatient}
        />
      </div>
    );
  }
}
