import * as React from 'react';
import * as Dropzone from 'react-dropzone';
import * as cx from 'classnames';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import Props from './props';

import { FormattedMessage, injectIntl, InjectedIntl, defineMessages } from 'react-intl';

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
 * A calm line-style illustration of a cephalogram card with tracing landmarks.
 * Inline SVG (no external assets); colors come from the stylesheet so the
 * drag-over/reject states can tint it.
 */
const CephIllustration = () => (
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

class CephDropzone extends React.PureComponent<Props & InjectedIntlProps, { }> {
  dropzone: null | React.ReactInstance & { open: Function };

  render() {
    const {
      onFilesDrop,
      onDemoButtonClick,
      isOffline,
      className,
      allowsMultipleFiles = false,
      intl: { formatMessage },
    } = this.props;
    return (
      <Dropzone
        ref={this.setRef}
        className={cx(className, classes.dropzone)}
        activeClassName={classes.dropzone__active}
        rejectClassName={classes.dropzone__reject}
        onDrop={onFilesDrop}
        multiple={allowsMultipleFiles}
        disableClick
        disablePreview
      >
        <div className={classes.dropzone_card}>
          <div className={classes.dropzone_placeholder}>
            <CephIllustration />
            <span className={classes.dropzone_placeholder_text}>
              <FormattedMessage
                id="callout_start_tracing"
                defaultMessage="To start tracing, drop a cephalogram or photograph here"
              />
            </span>
            <span className={classes.dropzone_drop_hint}>
              Drag &amp; drop anywhere inside this frame
            </span>
            <RaisedButton
              primary
              label={formatMessage(messageDescriptors.action_pick_image)}
              labelStyle={{ textTransform: 'none', fontWeight: 600 }}
              onClick={this.openFilePicker}
            />
            {isOffline ? null : (
              <div className={classes.dropzone_load_demo}>
                <span className={classes.dropzone_hint}>
                  {formatMessage(messageDescriptors.callout_load_sample_image)}
                </span>
                <FlatButton
                  primary
                  label={formatMessage(messageDescriptors.action_load_sample_image)}
                  labelStyle={{ textTransform: 'none', fontWeight: 500 }}
                  onClick={onDemoButtonClick}
                />
              </div>
            )}
          </div>
        </div>
      </Dropzone>
    );
  };

  private setRef = (node: any) => this.dropzone = node;
  private openFilePicker = () => {
    if (this.dropzone !== null) {
      this.dropzone.open();
    }
  }
};

export default injectIntl(CephDropzone);
