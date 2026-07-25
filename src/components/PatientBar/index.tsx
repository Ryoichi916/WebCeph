import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import TextField from 'material-ui/TextField';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import { List, ListItem } from 'material-ui/List';
import IconButton from 'material-ui/IconButton';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconPerson from 'material-ui/svg-icons/social/person';

import Props from './props';

interface State {
  open: boolean;
  name: string;
  chartId: string;
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 10px',
  background: '#0b3c8c',
  color: 'white',
  fontSize: '14px',
};

export default class PatientBar extends React.PureComponent<Props, State> {
  state: State = { open: false, name: '', chartId: '' };

  private open = () => this.setState({ open: true });
  private close = () => this.setState({ open: false, name: '', chartId: '' });

  private handleAdd = () => {
    const name = this.state.name.trim();
    const chartId = this.state.chartId.trim();
    if (name === '' && chartId === '') {
      return;
    }
    this.props.onAdd(name, chartId);
    this.setState({ name: '', chartId: '' });
  };

  private label(patient: Patient): string {
    if (patient.name && patient.chartId) {
      return `${patient.name} (${patient.chartId})`;
    }
    return patient.name || patient.chartId || '(unnamed)';
  }

  render() {
    const { className, patients, activePatient, onSelect, onRemove } = this.props;
    const { open, name, chartId } = this.state;
    return (
      <div className={className} style={barStyle}>
        <IconPerson color="white" style={{ width: 18, height: 18 }} />
        <span style={{ fontWeight: 600 }}>Patient:</span>
        <span>{activePatient ? this.label(activePatient) : '— none —'}</span>
        <span style={{ flexGrow: 1 }} />
        <FlatButton
          label="Patients"
          labelStyle={{ color: 'white' }}
          onClick={this.open}
        />
        <Dialog
          title="Patients"
          open={open}
          autoScrollBodyContent
          onRequestClose={this.close}
          actions={[<FlatButton key="close" label="Close" onClick={this.close} />]}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            <TextField
              floatingLabelText="Name"
              value={name}
              onChange={(_: any, v: string) => this.setState({ name: v })}
            />
            <TextField
              floatingLabelText="Chart ID"
              value={chartId}
              onChange={(_: any, v: string) => this.setState({ chartId: v })}
            />
            <RaisedButton primary label="Add" onClick={this.handleAdd} />
          </div>
          <List>
            {patients.length === 0 ? (
              <ListItem primaryText="No patients yet" disabled />
            ) : (
              patients.map((patient) => (
                <ListItem
                  key={patient.id}
                  primaryText={this.label(patient)}
                  leftIcon={<IconPerson />}
                  style={activePatient && activePatient.id === patient.id
                    ? { background: '#e3f2fd' }
                    : undefined}
                  onClick={() => onSelect(patient.id)}
                  rightIconButton={
                    <IconButton
                      tooltip="Remove"
                      onClick={(e: React.MouseEvent<{}>) => {
                        e.stopPropagation();
                        onRemove(patient.id);
                      }}
                    >
                      <IconDelete />
                    </IconButton>
                  }
                />
              ))
            )}
          </List>
        </Dialog>
      </div>
    );
  }
}
