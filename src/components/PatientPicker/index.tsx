import * as React from 'react';

import Paper from 'material-ui/Paper';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import { List, ListItem } from 'material-ui/List';
import IconButton from 'material-ui/IconButton';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconPerson from 'material-ui/svg-icons/social/person';
import IconArrow from 'material-ui/svg-icons/hardware/keyboard-arrow-right';

import Props from './props';

interface State {
  name: string;
  chartId: string;
}

const screenStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#eef2f7',
  overflow: 'auto',
};

const cardStyle: React.CSSProperties = {
  width: 480,
  maxWidth: '92vw',
  padding: '24px 28px',
  margin: '24px',
};

export default class PatientPicker extends React.PureComponent<Props, State> {
  state: State = { name: '', chartId: '' };

  private register = () => {
    const name = this.state.name.trim();
    const chartId = this.state.chartId.trim();
    if (name === '' && chartId === '') {
      return;
    }
    this.props.onRegister(name, chartId);
    this.setState({ name: '', chartId: '' });
  };

  private label(patient: Patient): string {
    if (patient.name && patient.chartId) {
      return `${patient.name} (${patient.chartId})`;
    }
    return patient.name || patient.chartId || '(unnamed)';
  }

  render() {
    const { patients, onOpen, onRemove } = this.props;
    const { name, chartId } = this.state;
    return (
      <div style={screenStyle}>
        <Paper style={cardStyle} zDepth={2}>
          <h2 style={{ margin: '0 0 4px', fontWeight: 400 }}>WebCeph</h2>
          <p style={{ marginTop: 0, color: '#607d8b' }}>Select a patient to open their project, or register a new one.</p>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
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
            <RaisedButton primary label="Register" onClick={this.register} />
          </div>

          <List>
            {patients.length === 0 ? (
              <ListItem primaryText="No patients yet — register one above." disabled />
            ) : (
              patients.map((patient) => (
                <ListItem
                  key={patient.id}
                  primaryText={this.label(patient)}
                  leftIcon={<IconPerson />}
                  rightIcon={<IconArrow />}
                  onClick={() => onOpen(patient.id)}
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
        </Paper>
      </div>
    );
  }
}
