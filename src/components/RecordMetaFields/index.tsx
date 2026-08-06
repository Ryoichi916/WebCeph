import * as React from 'react';

import * as cx from 'classnames';

import {
  IMAGE_TYPE_OPTIONS,
  DEFAULT_IMAGE_TYPE,
  getTodayISO,
  getImageTypeLabel,
  isTraceableImageType,
  formatCaptureDate,
} from 'utils/records';

const classes = require('./style.scss');

export interface RecordMetaFieldsProps {
  /** The record metadata being edited. */
  value: ImageRecordMeta;
  /** Called with the whole metadata object on every edit. */
  onChange(value: ImageRecordMeta): void;
  /** Micro-label + hint above the fields; omitted when the dialog says it. */
  title?: string;
  hint?: string;
  /** Latest date the capture-date field accepts (defaults to today). */
  maxCaptureDate?: string;
  className?: string;
}

/**
 * The three record fields — image type, timepoint, capture date — shared by the
 * upload screen (where they are filled before a file is added) and by "Edit
 * details" on an existing record. One component so the two surfaces can never
 * disagree about what a record can hold or about what the app will refuse to
 * trace.
 *
 * The capture date uses `input[type=date]`, which renders in the browser's
 * locale (US Chrome shows 08/06/2026). Every display surface in this app writes
 * dates as `YYYY/MM/DD`, so the parsed value is echoed under the field in that
 * form — on a clinical record an ambiguous 08/06 is not acceptable.
 */
export default class RecordMetaFields
  extends React.PureComponent<RecordMetaFieldsProps, { }> {
  render() {
    const { className, title, hint, maxCaptureDate } = this.props;
    const { type, timepoint, captureDate } = this.props.value;
    const dateEcho = formatCaptureDate(captureDate);
    return (
      <div className={cx(classes.record_form, className)}>
        {title !== undefined ? (
          <div className={classes.record_form_head}>
            <span className={classes.record_form_title}>{title}</span>
            {hint !== undefined ? (
              <span className={classes.record_form_hint}>{hint}</span>
            ) : null}
          </div>
        ) : null}
        <div className={classes.record_form_row}>
          <label className={classes.record_field}>
            <span className={classes.record_label}>Image type</span>
            <select
              className={cx(classes.record_input, classes.record_select)}
              value={type || DEFAULT_IMAGE_TYPE}
              onChange={this.handleTypeChange}
            >
              {IMAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={cx(classes.record_field, classes.record_field__timepoint)}>
            <span className={classes.record_label}>Timepoint</span>
            <input
              type="text"
              className={classes.record_input}
              value={timepoint || ''}
              placeholder="T1"
              maxLength={16}
              onChange={this.handleTimepointChange}
            />
            <span className={classes.record_help}>T1, T2, T3…</span>
          </label>
          <label className={cx(classes.record_field, classes.record_field__date)}>
            <span className={classes.record_label}>Capture date</span>
            <input
              type="date"
              className={cx(classes.record_input, classes.record_input_date)}
              value={captureDate || ''}
              max={maxCaptureDate !== undefined ? maxCaptureDate : getTodayISO()}
              onChange={this.handleCaptureDateChange}
            />
            <span
              className={cx(classes.record_help, classes.record_help__num, {
                [classes.record_help__unset]: dateEcho === null,
              })}
            >
              {dateEcho !== null ? dateEcho : 'YYYY/MM/DD'}
            </span>
          </label>
        </div>
        {isTraceableImageType(type) ? null : (
          <p className={classes.record_note}>
            {getImageTypeLabel(type)}s are stored and displayed with the
            record, but cephalometric tracing is only offered on lateral
            cephalograms.
          </p>
        )}
      </div>
    );
  }

  private handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.emit({ type: e.target.value as ImageType });
  };

  private handleTimepointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.emit({ timepoint: e.target.value });
  };

  private handleCaptureDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.emit({ captureDate: e.target.value });
  };

  private emit = (patch: Partial<ImageRecordMeta>) => {
    this.props.onChange({ ...this.props.value, ...patch });
  };
}

/**
 * The metadata as it should be stored: blank strings become nulls, so an
 * untouched field is recorded as "not recorded" rather than as an empty value
 * that later prints as a date.
 */
export const normalizeRecordMeta = (value: ImageRecordMeta): ImageRecordMeta => {
  const timepoint = (value.timepoint || '').trim();
  const captureDate = (value.captureDate || '').trim();
  return {
    type: value.type,
    timepoint: timepoint !== '' ? timepoint : null,
    captureDate: captureDate !== '' ? captureDate : null,
  };
};
