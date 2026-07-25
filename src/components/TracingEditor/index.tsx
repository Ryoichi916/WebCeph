import * as React from 'react';
import Props from './props';

import CephDropzone from 'components/CephDropzone/connected';
import TracingViewer from 'components/TracingViewer/connected';
import TracingToolbar from 'components/TracingToolbar/connected';
import AnalysisStepper from 'components/AnalysisStepper/connected';
import PatientBar from 'components/PatientBar/connected';

const classes = require('./style.scss');

export default class TracingEditor extends React.PureComponent<Props, { }> {
  render() {
    const {
      imageId,
      className,
      onFilesDrop,
      onDemoButtonClick,
    } = this.props;
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column' }}>
        <PatientBar />
        {(imageId !== null) ? (
          <div className={classes.tracing}>
            <TracingViewer
              className={classes.main}
              imageId={imageId}
            />
            <AnalysisStepper className={classes.stepper} />
          </div>
        ) : (
          <CephDropzone
            onFilesDrop={onFilesDrop}
            onDemoButtonClick={onDemoButtonClick}
            className={classes.main}
          />
        )}
        <TracingToolbar className={classes.toolbar} imageId={imageId} />
      </div>
    );
  }
}
