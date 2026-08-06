import * as React from 'react';
import * as Dropzone from 'react-dropzone';
import * as cx from 'classnames';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import Props from './props';

import { FormattedMessage, injectIntl, InjectedIntl, defineMessages } from 'react-intl';

import RecordMetaFields, { normalizeRecordMeta } from 'components/RecordMetaFields';

import {
  DEFAULT_IMAGE_TYPE,
  getTodayISO,
  getImageTypeLabelInSentence,
  isTraceableImageType,
} from 'utils/records';

type InjectedIntlProps = {
  intl: InjectedIntl;
};

const messageDescriptors = defineMessages({
  action_load_sample_image: {
    id: 'action_load_sample_image',
    defaultMessage: 'Load sample image',
  },
  callout_load_sample_image: {
    id: 'callout_load_sample_image',
    defaultMessage: 'No image at hand? Try the bundled sample cephalogram.',
  },
  action_pick_image: {
    id: 'action_pick_image',
    defaultMessage: 'Click to pick an image',
  },
});

const classes = require('./style.scss');

/**
 * The bundled sample image is a lateral cephalogram. It is filed as one no
 * matter which type the form happens to be showing — a sample cannot be
 * re-labelled into a panoramic or a photograph just because the select says so.
 */
const SAMPLE_IMAGE_TYPE: ImageType = 'ceph_lateral';

/**
 * A calm line-style illustration of a record card. Inline SVG (no external
 * assets); colors come from the stylesheet so the drag-over/reject states can
 * tint it.
 *
 * `showTracingMarks` draws the landmark dots and the S–N construction line.
 * They are dropped for a non-traceable type: promising landmarks over a
 * panoramic or a photograph would contradict the note right below the form.
 */
const CephIllustration = ({ showTracingMarks }: { showTracingMarks: boolean }) => (
  <svg
    className={classes.illustration}
    width="168"
    height="168"
    viewBox="0 0 168 168"
    aria-hidden="true"
  >
    {/* soft backdrop disc */}
    <circle className={classes.illustration_disc} cx="84" cy="84" r="80" />
    {/* radiograph card */}
    <rect
      className={classes.illustration_card}
      x="38" y="26" width="92" height="116" rx="10"
    />
    {/* profile tracing line */}
    <path
      className={classes.illustration_profile}
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M 96 40
         C 103 48 106 56 105 64
         C 104 71 100 75 96 78
         C 101 82 104 87 103 92
         C 102 97 98 100 94 102
         C 98 106 99 111 97 116
         C 94 122 87 126 79 127
         C 71 128 63 125 58 119"
    />
    {showTracingMarks ? (
      <g>
        {/* landmark dots */}
        <g className={classes.illustration_dots}>
          <circle cx="96" cy="40" r="3" />
          <circle cx="105" cy="64" r="3" />
          <circle cx="96" cy="78" r="3" />
          <circle cx="103" cy="92" r="3" />
          <circle cx="97" cy="116" r="3" />
          <circle cx="58" cy="119" r="3" />
          <circle cx="62" cy="52" r="3" />
        </g>
        {/* construction line S–N */}
        <line
          className={classes.illustration_construction}
          x1="62" y1="52" x2="96" y2="40"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </g>
    ) : null}
    {/* upload badge */}
    <g className={classes.illustration_badge}>
      <circle cx="126" cy="126" r="20" />
      <path
        className={classes.illustration_badge_arrow}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 126 134 L 126 119 M 119.5 125 L 126 118 L 132.5 125"
      />
    </g>
  </svg>
);

type State = ImageRecordMeta;

class CephDropzone extends React.PureComponent<Props & InjectedIntlProps, State> {
  dropzone: null | React.ReactInstance & { open: Function };

  // The record details the image will be filed under. Pre-filled with the
  // sensible defaults (lateral ceph, the next timepoint in the series, today)
  // so the fast path stays a single click, but visible and editable before the
  // file is chosen — nothing is stamped on the record unseen.
  state: State = {
    type: DEFAULT_IMAGE_TYPE,
    timepoint: this.props.defaultTimepoint,
    captureDate: getTodayISO(),
  };

  render() {
    const {
      isOffline,
      className,
      allowsMultipleFiles = false,
      intl: { formatMessage },
    } = this.props;
    const { type } = this.state;
    const isTraceable = isTraceableImageType(type);
    return (
      <Dropzone
        ref={this.setRef}
        className={cx(className, classes.dropzone)}
        activeClassName={classes.dropzone__active}
        rejectClassName={classes.dropzone__reject}
        onDrop={this.handleDrop}
        multiple={allowsMultipleFiles}
        disableClick
        disablePreview
      >
        <div className={classes.dropzone_card}>
          <div className={classes.dropzone_placeholder}>
            <CephIllustration showTracingMarks={isTraceable} />
            <span className={classes.dropzone_placeholder_text}>
              {isTraceable ? (
                <FormattedMessage
                  id="callout_start_tracing"
                  defaultMessage="To start tracing, drop a cephalogram or photograph here"
                />
              ) : (
                `Add a ${getImageTypeLabelInSentence(type)} to this patient's record`
              )}
            </span>
            <span className={classes.dropzone_drop_hint}>
              Drag &amp; drop anywhere inside this frame
            </span>
            <RecordMetaFields
              className={classes.record_form_slot}
              title="Record details"
              hint="Filed with the image you add — change any of these first"
              value={this.state}
              onChange={this.handleMetaChange}
            />
            <RaisedButton
              primary
              label={formatMessage(messageDescriptors.action_pick_image)}
              labelStyle={{ textTransform: 'none', fontWeight: 600 }}
              onClick={this.openFilePicker}
            />
            {isOffline ? null : (
              <div className={classes.dropzone_load_demo}>
                <span className={classes.dropzone_hint}>
                  {isTraceable
                    ? formatMessage(messageDescriptors.callout_load_sample_image)
                    : 'The bundled sample is a lateral cephalogram — it is filed ' +
                      'as one, not as the type selected above.'}
                </span>
                <FlatButton
                  primary
                  label={isTraceable
                    ? formatMessage(messageDescriptors.action_load_sample_image)
                    : 'Load sample lateral cephalogram'}
                  labelStyle={{ textTransform: 'none', fontWeight: 500 }}
                  onClick={this.handleDemoClick}
                />
              </div>
            )}
          </div>
        </div>
      </Dropzone>
    );
  };

  private getMeta = (): ImageRecordMeta => normalizeRecordMeta(this.state);

  private handleMetaChange = (value: ImageRecordMeta) => this.setState(value);

  private handleDrop = (files: File[]) => this.props.onFilesDrop(files, this.getMeta());

  // The sample is a lateral cephalogram; its type is not taken from the form.
  // Filing it as whatever the select showed produced a record that called an
  // unmistakable lateral ceph a "Profile photograph" and then refused to
  // analyse it.
  private handleDemoClick = () => this.props.onDemoButtonClick({
    ...this.getMeta(),
    type: SAMPLE_IMAGE_TYPE,
  });

  private setRef = (node: any) => this.dropzone = node;
  private openFilePicker = () => {
    if (this.dropzone !== null) {
      this.dropzone.open();
    }
  }
};

export default injectIntl(CephDropzone);
