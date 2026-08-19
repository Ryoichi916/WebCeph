import * as React from 'react';
import Props from './props';

import CephDropzone from 'components/CephDropzone/connected';
import TracingViewer from 'components/TracingViewer/connected';
import TracingToolbar from 'components/TracingToolbar/connected';
import AnalysisStepper from 'components/AnalysisStepper/connected';
import AnalysisResultsViewer from 'components/AnalysisResultsViewer/connected';
import RecordViewer from 'components/RecordViewer/connected';

import CircularProgress from 'material-ui/CircularProgress';

const classes = require('./style.scss');

export default class TracingEditor extends React.PureComponent<Props, { }> {
  render() {
    const {
      imageId,
      className,
      isLoadingFile,
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
          <div className={classes.main}>
            <CephDropzone
              defaultTimepoint={defaultTimepoint}
              onFilesDrop={onFilesDrop}
              onDemoButtonClick={onDemoButtonClick}
              className={classes.dropzone_fill}
            />
            {/* Reading a file off disk and decoding it (a large hi-res scan
                can take a real, visible moment on a clinic PC) has no
                `imageId` to switch the editor onto yet — without this the
                dropzone would otherwise just sit there through the whole
                wait, indistinguishable from a drop that silently failed. */}
            {isLoadingFile ? (
              <div className={classes.import_overlay} role="status" aria-live="polite">
                <div className={classes.import_overlay_card}>
                  <CircularProgress size={32} thickness={2.5} />
                  <span className={classes.import_overlay_text}>
                    Reading and decoding the image…
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <AnalysisResultsViewer open={isSummaryShown} />
      </div>
    );
  }
}
