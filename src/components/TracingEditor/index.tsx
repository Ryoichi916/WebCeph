import * as React from 'react';
import Props from './props';

import CephDropzone from 'components/CephDropzone/connected';
import TracingViewer from 'components/TracingViewer/connected';
import TracingToolbar from 'components/TracingToolbar/connected';
import AnalysisStepper from 'components/AnalysisStepper/connected';
import AnalysisResultsViewer from 'components/AnalysisResultsViewer/connected';
import RecordViewer from 'components/RecordViewer/connected';

import CircularProgress from 'material-ui/CircularProgress';
import IconError from 'material-ui/svg-icons/alert/error-outline';

const classes = require('./style.scss');

// Matches `$error` in src/_variables.scss — a Sass variable is not reachable
// from here, and the icon (an SVG whose own fill an ordinary CSS class does
// not reliably override, unlike the surrounding markup) needs its color as a
// prop, not a class, the same way the toolbar's own status icons take theirs.
const ERROR_COLOR = '#C62828';

export default class TracingEditor extends React.PureComponent<Props, { }> {
  render() {
    const {
      imageId,
      className,
      isLoadingFile,
      importError,
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
            {/* The dropzone itself has no store slice to read this from (see
                its own props.ts) — it reaches no rendered surface at all
                without this, so a corrupt or unsupported file just sat there
                looking exactly like nothing had happened. A banner, not the
                loading state's full scrim: the very next thing a clinician
                does is pick a different file, and the loading overlay's
                inset:0 backdrop sat on top of "Choose image…" and blocked
                the retry it was itself telling them to make. The dropzone
                stays fully live underneath; choosing another file clears
                this the same as any other IMPORT_FILE_REQUESTED. */}
            {!isLoadingFile && importError !== null ? (
              <div className={classes.import_error_banner} role="alert">
                <IconError
                  className={classes.import_error_icon}
                  color={ERROR_COLOR}
                />
                <span className={classes.import_error_text}>
                  {importError.message}
                </span>
              </div>
            ) : null}
          </div>
        )}
        <AnalysisResultsViewer open={isSummaryShown} />
      </div>
    );
  }
}
