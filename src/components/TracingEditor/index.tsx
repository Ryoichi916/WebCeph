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
import IconWarning from 'material-ui/svg-icons/alert/warning';

const classes = require('./style.scss');

// Matches `$error` / `$warn` in src/_variables.scss — a Sass variable is not
// reachable from here, and the icon (an SVG whose own fill an ordinary CSS
// class does not reliably override, unlike the surrounding markup) needs its
// color as a prop, not a class, the same way the toolbar's own status icons
// take theirs.
const ERROR_COLOR = '#C62828';
const WARN_COLOR = '#B26A00';

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
      isPlaceholderAutoPlot,
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
        {/* Auto-plot's positions on this image are the demo predictor's
            fabricated placeholder (see predictors/demo.ts), not a real
            detection — real-looking angle values with no anatomy behind
            them. Kept up for the rest of the session rather than dismissible:
            nothing here tracks which points a clinician has actually checked,
            so nothing can honestly say the warning no longer applies. Placed
            first in the DOM (and default flex `order`, ahead of the toolbar's
            order:2 and the tracing area's order:1 — see style.scss) so it is
            the first thing announced and the first thing seen. */}
        {imageId !== null && isPlaceholderAutoPlot ? (
          <div className={classes.placeholder_banner} role="alert">
            <IconWarning
              className={classes.placeholder_banner_icon}
              color={WARN_COLOR}
            />
            <span className={classes.placeholder_banner_text}>
              <strong>Demo auto-plot — not a real detection.</strong>{' '}
              These landmark positions come from the placeholder predictor,
              calibrated only to the bundled sample film; on this image they
              are fabricated, not read off its anatomy. Verify and correct
              every point by hand before treating this tracing as a clinical
              reading.
            </span>
          </div>
        ) : null}
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
