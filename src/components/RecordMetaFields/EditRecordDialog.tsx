import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import RecordMetaFields, { normalizeRecordMeta } from './index';

import { getImageTypeLabel, isTraceableImageType } from 'utils/records';

const classes = require('./dialog.scss');

export interface EditRecordDialogProps {
  open: boolean;
  /** The metadata currently on the record — the dialog opens on these values. */
  initialValue: ImageRecordMeta;
  /** File name of the image being edited, shown so the right film is edited. */
  fileName: string | null;
  onSave(value: ImageRecordMeta): any;
  onCancel(): any;
}

/**
 * "Edit details" for an image already on file: the same three fields the upload
 * screen offers, re-opened so a mis-typed film, a wrong timepoint or a wrong
 * capture date can be corrected. Without this, record metadata was write-once
 * and a photograph filed as a lateral ceph (or the reverse) was permanent.
 *
 * Changing the type to a lateral cephalogram makes the image traceable again;
 * changing it away from one hands it to the read-only record viewer. The dialog
 * says which of the two will happen before the change is saved.
 */
export default class EditRecordDialog
  extends React.PureComponent<EditRecordDialogProps, { value: ImageRecordMeta }> {
  state = { value: this.props.initialValue };

  componentWillReceiveProps(next: EditRecordDialogProps) {
    // Re-opening on a different record (or after a cancel) starts from what is
    // actually stored, never from the previous edit.
    if (next.open && !this.props.open) {
      this.setState({ value: next.initialValue });
    }
  }

  render() {
    const { open, fileName, onCancel } = this.props;
    const { value } = this.state;
    const wasTraceable = isTraceableImageType(this.props.initialValue.type);
    const willBeTraceable = isTraceableImageType(value.type);
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onCancel}
        title={
          <div className={classes.title}>
            <h3 className={classes.title_heading}>Edit record details</h3>
            <span className={classes.title_caption}>
              {fileName !== null ? fileName : 'Image on file'}
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="cancel"
            label="Cancel"
            labelStyle={{ textTransform: 'none' }}
            onClick={onCancel}
          />,
          <RaisedButton
            key="save"
            primary
            label="Save details"
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            style={{ marginLeft: 8 }}
            onClick={this.handleSave}
          />,
        ]}
        contentStyle={{ width: '92%', maxWidth: 560 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
      >
        <RecordMetaFields
          value={value}
          onChange={this.handleChange}
          className={classes.fields}
        />
        {willBeTraceable !== wasTraceable ? (
          <p className={willBeTraceable ? classes.effect__ok : classes.effect__warn}>
            {willBeTraceable
              ? `Saving will re-file this image as a ` +
                `${getImageTypeLabel(value.type).toLowerCase()}: landmark ` +
                `tracing, analyses and the clinical report become available on it.`
              : `Saving will re-file this image as a ` +
                `${getImageTypeLabel(value.type).toLowerCase()}: it will be kept ` +
                `with the record but shown read-only, and any tracing already ` +
                `placed on it will no longer be analysed.`}
          </p>
        ) : null}
      </Dialog>
    );
  }

  private handleChange = (value: ImageRecordMeta) => this.setState({ value });

  private handleSave = () => this.props.onSave(normalizeRecordMeta(this.state.value));
}
