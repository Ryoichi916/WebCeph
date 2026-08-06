import * as React from 'react';
import Props from './props';

import CephDropzone from 'components/CephDropzone/connected';
import TracingViewer from 'components/TracingViewer/connected';
import TracingToolbar from 'components/TracingToolbar/connected';
import AnalysisStepper from 'components/AnalysisStepper/connected';
import AnalysisResultsViewer from 'components/AnalysisResultsViewer/connected';
import RecordViewer from 'components/RecordViewer/connected';

const classes = require('./style.scss');

export default class TracingEditor extends React.PureComponent<Props, { }> {
  render() {
    const {
      imageId,
      className,
      isSummaryShown,
      isImageTraceable,
      defaultTimepoint,
      onFilesDrop,
      onDemoButtonClick,
    } = this.props;
    // A non-traceable record image (frontal ceph, panoramic, photograph) gets
    // the read-only record view — no tracing toolbar, no stepper that could
    // never complete. See RecordViewer.
    if (imageId !== null && !isImageTraceable) {
      return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column' }}>
          <RecordViewer className={classes.record} imageId={imageId} />
        </div>
      );
    }
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column' }}>
        {/* The toolbar comes first in the DOM (its "Analysis: …" control is the
            primary analysis switcher) but is laid out at the bottom via flex
            order — see style.scss. */}
        <TracingToolbar className={classes.toolbar} imageId={imageId} />
        {(imageId !== null) ? (
          <div className={classes.tracing}>
            <div className={classes.canvas_area}>
              <TracingViewer
                className={classes.canvas_wrap}
                imageId={imageId}
              />
            </div>
            <AnalysisStepper className={classes.stepper} />
          </div>
        ) : (
          <CephDropzone
            defaultTimepoint={defaultTimepoint}
            onFilesDrop={onFilesDrop}
            onDemoButtonClick={onDemoButtonClick}
            className={classes.main}
          />
        )}
        <AnalysisResultsViewer open={isSummaryShown} />
      </div>
    );
  }
}
