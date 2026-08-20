import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import {
  getImageTypeLabel,
  formatCaptureDate,
  isTraceableImageType,
} from 'utils/records';

const classes = require('./dialog.scss');

export interface RemoveRecordDialogProps {
  open: boolean;
  type: ImageType | null;
  timepoint: string | null;
  captureDate: string | null;
  fileName: string | null;
  /**
   * The film itself, at the card's own ratio. A clinician confirming the
   * deletion of "T1 · Lateral cephalogram · 2026-02-03" out of two identically
   * named films had only the file name to go on, on a surface where every other
   * row carries its image.
   */
  thumbnail?: string | null;
  /**
   * Whether anything has been traced on this image (said out loud if so).
   * This must be the true total stored for the film — `record.landmarkPoints.length`,
   * the same figure the dashboard's own StatusChip discloses via its
   * "· N plotted in all" badge — and never just the active analysis's manual
   * step count. A film can carry landmarks from more than one analysis (e.g.
   * auto-plotted for a Clinical Report covering all nine), and this is the one
   * dialog whose explicit job is to state exactly what an irreversible removal
   * destroys; understating that count here would misstate the loss.
   */
  landmarksPlaced: number;
  /**
   * How many other images the patient has on file. Removing an image clears the
   * project's tracing undo history (see store/index#HISTORY_CLEARING_ACTIONS),
   * which is only a loss to state where there are other tracings to lose it
   * for.
   */
  otherRecordCount?: number;
  onConfirm(): any;
  onCancel(): any;
}

/**
 * Confirmation for "Remove from record" — the only destructive action in the
 * records module, so it names the exact film (its own thumbnail, then
 * timepoint · type · date · file), says how many landmarks go with it, and says
 * plainly that it cannot be undone.
 *
 * That last part is not a formality: `CLOSE_IMAGE_REQUESTED` is one of the
 * store's history-clearing actions, so the removal is outside undo *and* it
 * empties the tracing history of every other image in the project. In an app
 * whose toolbar carries Undo and Redo, saying nothing here reads as "Ctrl-Z
 * will fix it".
 */
export default class RemoveRecordDialog
  extends React.PureComponent<RemoveRecordDialogProps, { }> {
  render() {
    const {
      open, type, timepoint, captureDate, fileName, landmarksPlaced,
      thumbnail = null, otherRecordCount = 0,
      onConfirm, onCancel,
    } = this.props;
    const date = formatCaptureDate(captureDate);
    const identity = [
      timepoint,
      getImageTypeLabel(type),
      date,
    ].filter((part) => part !== null).join(' · ');
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onCancel}
        // Screen-only chrome — see EditRecordDialog.
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <h3 className={classes.title_heading}>Remove this image from the record?</h3>
            <span className={classes.title_caption}>
              {fileName !== null ? fileName : 'Image on file'}
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="cancel"
            label="Keep it"
            labelStyle={{ textTransform: 'none' }}
            onClick={onCancel}
          />,
          <RaisedButton
            key="remove"
            label="Remove image"
            backgroundColor="#C62828"
            labelColor="#FFFFFF"
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            style={{ marginLeft: 8 }}
            onClick={onConfirm}
          />,
        ]}
        contentStyle={{ width: '92%', maxWidth: 520 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
      >
        <div className={classes.remove_body}>
          {/* Which film. At the record card's own 68 × 85 film ratio, on the
              canvas black a radiograph is displayed on. */}
          <span className={classes.remove_thumb}>
            {thumbnail !== null ? (
              <img
                className={classes.remove_thumb_img}
                src={thumbnail}
                alt=""
                draggable={false}
              />
            ) : (
              <span className={classes.remove_thumb_none}>No preview</span>
            )}
          </span>
          <div className={classes.remove_text_col}>
            <p className={classes.remove_identity}>{identity}</p>
            <p className={classes.remove_text}>
              The image and its record details leave the patient's timeline.
              {/* What goes with it, said only where tracing is a thing this
                  image could have. On a photograph or a panoramic — types this
                  app never traces — "Nothing has been traced on it" reads as a
                  state that could have been otherwise, on the one dialog whose
                  job is to state exactly what is being lost. */}
              {landmarksPlaced > 0
                ? ` The ${landmarksPlaced} landmark${landmarksPlaced === 1 ? '' : 's'} ` +
                  `traced on it are removed with it.`
                : (isTraceableImageType(type) ? ' Nothing has been traced on it.' : '')}
              {' '}The original file on your computer is untouched.
            </p>
            <p className={classes.remove_warn}>
              <strong className={classes.remove_warn_head}>
                This cannot be undone.
              </strong>
              {otherRecordCount > 0
                ? ` Undo and redo do not reach a removed image, and removing it ` +
                  `also clears the tracing history of the ` +
                  `${otherRecordCount === 1
                    ? 'other image' : `other ${otherRecordCount} images`} ` +
                  `in this project — their tracings themselves are untouched.`
                : ' Undo and redo do not reach a removed image.'}
            </p>
          </div>
        </div>
      </Dialog>
    );
  }
}
