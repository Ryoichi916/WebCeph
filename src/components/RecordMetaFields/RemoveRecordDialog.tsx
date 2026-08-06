import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import { getImageTypeLabel, formatCaptureDate } from 'utils/records';

const classes = require('./dialog.scss');

export interface RemoveRecordDialogProps {
  open: boolean;
  type: ImageType | null;
  timepoint: string | null;
  captureDate: string | null;
  fileName: string | null;
  /** Whether anything has been traced on this image (said out loud if so). */
  landmarksPlaced: number;
  onConfirm(): any;
  onCancel(): any;
}

/**
 * Confirmation for "Remove from record". Removing an image drops its tracing
 * with it and cannot be undone from here, so the dialog names the exact film
 * (timepoint · type · date · file) and says how many landmarks go with it.
 */
export default class RemoveRecordDialog
  extends React.PureComponent<RemoveRecordDialogProps, { }> {
  render() {
    const {
      open, type, timepoint, captureDate, fileName, landmarksPlaced,
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
        <p className={classes.remove_identity}>{identity}</p>
        <p className={classes.remove_text}>
          The image and its record details leave the patient's timeline.
          {landmarksPlaced > 0
            ? ` The ${landmarksPlaced} landmark${landmarksPlaced === 1 ? '' : 's'} ` +
              `traced on it are removed with it.`
            : ' Nothing has been traced on it.'}
          {' '}The original file on your computer is untouched.
        </p>
      </Dialog>
    );
  }
}
