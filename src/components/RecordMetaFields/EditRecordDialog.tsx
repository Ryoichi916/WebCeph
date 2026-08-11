import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import RecordMetaFields, { normalizeRecordMeta } from './index';

import {
  getImageTypeLabelWithArticle,
  isTraceableImageType,
} from 'utils/records';

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
    const isEffectShown = willBeTraceable !== wasTraceable;
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onCancel}
        // Screen-only chrome: printing the records chart with this dialog open
        // put the modal's grey wash over the whole sheet and the dialog itself
        // on top of the films.
        className={classes.no_print}
        overlayClassName={classes.no_print}
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
        // 600, not 560: the record fields are laid out on a documented
        // 186 + 132 + 164 basis (see RecordMetaFields/style.scss), which needs
        // 506px of well. At 560 the well was 478 and the row wrapped — Capture
        // date alone on a second line and a ~280px void beside the Timepoint
        // field — so one component had two layouts, tidy on the upload surface
        // and broken in the dialog.
        contentStyle={{ width: '92%', maxWidth: 600 }}
        bodyStyle={{ padding: '4px 24px 8px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '12px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '20px 24px 12px' }}
      >
        <RecordMetaFields
          value={value}
          onChange={this.handleChange}
          className={classes.fields}
          // One amber panel per consequence: the effect line below states it
          // for the type being chosen, so the field's own note stands down.
          showTypeNote={!isEffectShown}
        />
        {isEffectShown ? (
          <p className={willBeTraceable ? classes.effect__ok : classes.effect__warn}>
            {/* The label and its article both come from the catalogue: built
                here from `getImageTypeLabel(...).toLowerCase()` and a hardcoded
                "a", this line printed "as a frontal (pa) cephalogram" — the PA
                abbreviation destroyed on the single likeliest use of this
                dialog — and "as a intraoral photograph". */}
            {willBeTraceable
              ? `Saving will re-file this image as ` +
                `${getImageTypeLabelWithArticle(value.type)}: landmark ` +
                `tracing, analyses and the clinical report become available on it.`
              : `Saving will re-file this image as ` +
                `${getImageTypeLabelWithArticle(value.type)}: it will be kept ` +
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
