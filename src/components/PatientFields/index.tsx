import * as React from 'react';

import * as cx from 'classnames';

// The app's one date formatter (ISO `YYYY-MM-DD`), so a typed date is echoed in
// exactly the form every other screen — and the printed report — states it in.
import { formatCaptureDate } from 'utils/records';

const classes = require('./style.scss');

/**
 * The patient-demographics form fields, in one place.
 *
 * Registration (components/PatientPicker) and "Edit patient details" on the
 * records dashboard ask for the same four things — name, chart ID, date of
 * birth, sex — and must ask for them identically: the same labels, the same
 * ISO echo under the date input, the same two-segment sex control that can be
 * cleared, the same error affordance. These are those fields; neither surface
 * owns a second copy.
 */

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Today as ISO `YYYY-MM-DD` — the `max` of any date-of-birth input. */
export const getTodayISO = (at: Date = new Date()): string =>
  `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;

export const FieldErrorIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    aria-hidden="true"
    className={classes.field_error_icon}
  >
    <circle cx="8" cy="8" r="7" fill="#C62828" />
    <rect x="7.2" y="3.8" width="1.6" height="5.4" rx=".8" fill="#FFFFFF" />
    <circle cx="8" cy="11.6" r="1" fill="#FFFFFF" />
  </svg>
);

/** The micro label above a field, with its optional "optional" aside. */
const FieldLabel = (
  { text, optional }: { text: string; optional?: boolean },
) => (
  <span className={classes.field_label}>
    {text}
    {optional === true ? (
      <span className={classes.field_optional}>optional</span>
    ) : null}
  </span>
);

export interface PatientTextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  /** Outlines the input in red; set independently of `message`. */
  invalid?: boolean;
  /** Validation message shown on the reserved line under the input. */
  message?: string | null;
  className?: string;
  autoFocus?: boolean;
  onChange(value: string): any;
  onKeyDown?(e: React.KeyboardEvent<{}>): any;
}

/** Name / chart ID: a 36px text input with a micro label and an error line. */
export const PatientTextField = ({
  label, value, placeholder, invalid = false, message = null,
  className, autoFocus, onChange, onKeyDown,
}: PatientTextFieldProps) => (
  <label className={cx(classes.field, className)}>
    <FieldLabel text={label} />
    <input
      type="text"
      className={cx(classes.field_input, {
        [classes.field_input_error]: invalid,
      })}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      onKeyDown={onKeyDown}
    />
    <span className={classes.field_error} role="alert">
      {message !== null ? (
        <span className={classes.field_error_inner}>
          <FieldErrorIcon />
          {message}
        </span>
      ) : null}
    </span>
  </label>
);

export interface DateOfBirthFieldProps {
  value: string;
  className?: string;
  onChange(value: string): any;
  onKeyDown?(e: React.KeyboardEvent<{}>): any;
}

/**
 * Date of birth. `input[type=date]` paints in the browser's locale, so US
 * Chrome shows 08/06/2026 — ambiguous on a clinical record. Every display
 * surface in this app writes ISO YYYY-MM-DD, so the parsed value is echoed
 * below the input in that form.
 */
export const DateOfBirthField = ({
  value, className, onChange, onKeyDown,
}: DateOfBirthFieldProps) => {
  const echo = formatCaptureDate(value);
  return (
    <label className={cx(classes.field, className)}>
      <FieldLabel text="Date of birth" optional />
      <input
        type="date"
        className={cx(classes.field_input, classes.field_input_date, {
          // The empty date input shows the browser's yyyy/mm/dd scaffold —
          // mute it to placeholder gray so it does not read as a value.
          [classes.field_input_date_empty]: value === '',
        })}
        aria-label="Date of birth"
        max={getTodayISO()}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      {/* Labelled, because this slot is not a validation line and not a second
          date field: it states what will be written to the record. */}
      <span
        className={cx(classes.field_echo, {
          [classes.field_echo_set]: echo !== null,
        })}
      >
        Stored as{' '}
        <span className={classes.field_echo_value}>
          {echo !== null ? echo : 'YYYY-MM-DD'}
        </span>
      </span>
    </label>
  );
};

export interface SexFieldProps {
  value: PatientSex;
  className?: string;
  onChange(value: PatientSex): any;
}

/**
 * Sex: a two-option segmented control. Clicking the selected segment again
 * clears the (optional) field.
 *
 * Not a `<label>`: clicking the caption of a label containing buttons would
 * forward the click to the first button and silently select "Female".
 */
export const SexField = ({ value, className, onChange }: SexFieldProps) => {
  const segment = (sex: 'female' | 'male', label: string) => (
    <button
      type="button"
      className={cx(classes.segment, {
        [classes.segment_active]: value === sex,
      })}
      aria-pressed={value === sex}
      title={value === sex ? 'Click again to clear' : undefined}
      onClick={() => onChange(value === sex ? '' : sex)}
    >
      {label}
    </button>
  );
  return (
    <div className={cx(classes.field_sex, className)}>
      <FieldLabel text="Sex" optional />
      <div className={classes.segmented} role="group" aria-label="Sex">
        {segment('female', 'Female')}
        {segment('male', 'Male')}
      </div>
    </div>
  );
};

/** What the four fields hold; the shape both surfaces validate and submit. */
export interface PatientDetails {
  name: string;
  chartId: string;
  dateOfBirth: string;
  sex: PatientSex;
}

export type PatientDetailsErrorField = 'name' | 'chartId' | 'both';

export interface PatientDetailsError {
  field: PatientDetailsErrorField;
  message: string;
}

/**
 * The one validation rule set for patient details, shared by registration and
 * by editing an existing patient: a record needs a name or a chart ID, and a
 * chart ID may not collide with another patient's.
 *
 * `otherChartIds` are the chart IDs of every *other* patient — a patient
 * keeping their own chart ID is not a duplicate of themselves. `verb` names the
 * action the form performs, so the message reads as its own button.
 */
export const validatePatientDetails = (
  { name, chartId }: PatientDetails,
  otherChartIds: string[],
  verb: string = 'save',
): PatientDetailsError | null => {
  const trimmedName = name.trim();
  const trimmedChartId = chartId.trim();
  if (trimmedName === '' && trimmedChartId === '') {
    return {
      field: 'both',
      message: `Enter a name or chart ID to ${verb}.`,
    };
  }
  const taken = otherChartIds.some(
    (id) => id.trim().toLowerCase() === trimmedChartId.toLowerCase(),
  );
  if (trimmedChartId !== '' && taken) {
    return { field: 'chartId', message: 'This chart ID is already in use.' };
  }
  return null;
};

export default PatientTextField;
