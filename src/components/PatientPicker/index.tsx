import * as React from 'react';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import IconButton from 'material-ui/IconButton';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconSearch from 'material-ui/svg-icons/action/search';
import IconLock from 'material-ui/svg-icons/action/lock-outline';
import IconPersonOutline from 'material-ui/svg-icons/social/person-outline';
import IconArrow from 'material-ui/svg-icons/hardware/keyboard-arrow-right';

import Props from './props';

import { formatAgeShort, formatSexShort } from 'utils/patient';
// Same ISO -> YYYY/MM/DD formatter the records surfaces use, so the date the
// user typed is echoed in exactly the form every other screen prints.
import { formatCaptureDate } from 'utils/records';

const classes = require('./style.scss');

type ErrorField = 'name' | 'chartId' | 'both';

interface ValidationError {
  field: ErrorField;
  message: string;
}

interface State {
  name: string;
  chartId: string;
  dateOfBirth: string;
  sex: PatientSex;
  query: string;
  error: ValidationError | null;
  pendingRemoval: Patient | null;
}

const registerLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 600,
};

const cancelButtonStyle: React.CSSProperties = {
  height: 36,
  lineHeight: '36px',
  minWidth: 88,
  border: '1px solid #C3CCD6',
  borderRadius: 6,
};

const cancelLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 500,
  fontSize: 14,
  color: '#1F2933',
};

const removeButtonStyle: React.CSSProperties = {
  marginLeft: 12,
};

const removeLabelStyle: React.CSSProperties = {
  textTransform: 'none',
  fontWeight: 600,
  fontSize: 14,
};

const transparentOverlay: React.CSSProperties = {
  backgroundColor: 'transparent',
};

const dialogTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: '#1F2933',
  padding: '24px 24px 8px',
};

const dialogBodyStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#52616F',
  padding: '0 24px 8px',
};

const dialogActionsStyle: React.CSSProperties = {
  padding: '12px 24px 20px',
};

const dialogPaperStyle: React.CSSProperties = {
  borderRadius: 8,
  boxShadow: '0 12px 32px rgba(16, 30, 50, .28)',
};

const deleteButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 6,
  borderRadius: 999,
};

const deleteIconStyle: React.CSSProperties = {
  width: 20,
  height: 20,
};

/**
 * Initials for the patient avatar: first character for CJK names (e.g.
 * 山田 太郎 → 山), first letter of the first two words otherwise.
 */
const getInitials = (text: string): string => {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return '?';
  }
  if (/[　-〿぀-ヿ㐀-鿿豈-﫿]/.test(tokens[0])) {
    return tokens[0].charAt(0);
  }
  return tokens.slice(0, 2).map((t) => t.charAt(0).toUpperCase()).join('');
};

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * Registration date derived from the generated patient id
 * (`patient_<epoch ms>_<n>`); null when the id has another shape.
 * Formatted as a stable, locale-independent `YYYY/MM/DD`.
 */
const getRegisteredDate = (id: string): string | null => {
  const match = /_(\d{13})_/.exec(id);
  if (match === null) {
    return null;
  }
  const timestamp = parseInt(match[1], 10);
  if (!isFinite(timestamp)) {
    return null;
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
};

const patientDisplayName = (patient: Patient): string =>
  patient.name || patient.chartId || '(unnamed patient)';

/**
 * Compact demographics for the list row, e.g. `1998/04/12 · F · 28 y`;
 * null when the record carries neither a date of birth nor a sex.
 */
const getDemographicsLine = (patient: Patient): string | null => {
  const dob = patient.dateOfBirth !== undefined && patient.dateOfBirth !== ''
    ? patient.dateOfBirth.replace(/-/g, '/')
    : null;
  const parts = [
    dob,
    formatSexShort(patient.sex),
    formatAgeShort(patient.dateOfBirth),
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** Inline brand mark: a cephalometric profile with S–N line and landmarks. */
const BrandMark = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
    <circle
      cx="28" cy="28" r="26"
      fill="rgba(255,255,255,.07)"
      stroke="rgba(255,255,255,.38)"
      strokeWidth="1.5"
    />
    <path
      d={
        'M24 10.5 C29 10.5 33.5 13 35 17 C36 19.8 35.2 21.6 36.6 23.8 ' +
        'L39.4 27.9 L36.4 28.9 C36.6 30.3 37.2 31.5 36.2 32.5 ' +
        'C35.3 33.4 33.8 32.9 33.4 34.3 C32.9 36.1 33.6 37.7 31 38.9 ' +
        'C28.4 40 24.8 39.5 22 37.9'
      }
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="21" y1="21.5" x2="35" y2="17.5"
      stroke="#7CD1FF"
      strokeWidth="1.2"
      opacity=".9"
    />
    <circle cx="21" cy="21.5" r="2.1" fill="#FFC400" stroke="#0C3B66" />
    <circle cx="35" cy="17.5" r="2.1" fill="#FFC400" stroke="#0C3B66" />
    <circle cx="31" cy="38.9" r="2.1" fill="#FFC400" stroke="#0C3B66" />
  </svg>
);

/**
 * Faint landmark-constellation artwork for the brand panel: classic lateral
 * ceph landmarks (S, N, Or, Po, A, B, Pog, Me, Go, Ar) joined by the familiar
 * reference lines (S–N, N–A, N–B, Frankfort, mandibular plane).
 */
const lineProps = {
  stroke: 'rgba(255,255,255,.16)',
  strokeWidth: 1,
};

const dashedLineProps = {
  stroke: 'rgba(255,255,255,.12)',
  strokeWidth: 1,
  strokeDasharray: '3 4',
};

const dotProps = {
  r: 2.4,
  fill: 'rgba(255,255,255,.34)',
};

const labelProps: React.SVGProps<SVGTextElement> = {
  fontSize: 9,
  fontWeight: 600,
  fill: 'rgba(255,255,255,.34)',
  fontFamily: 'inherit',
};

const BrandConstellation = () => (
  <svg
    viewBox="0 0 224 300"
    preserveAspectRatio="xMidYMid meet"
    className={classes.brand_art_svg}
    aria-hidden="true"
  >
    {/* Reference lines */}
    <line x1="84" y1="62" x2="176" y2="74" {...lineProps} />          {/* S–N */}
    <line x1="176" y1="74" x2="178" y2="172" {...lineProps} />        {/* N–A */}
    <line x1="176" y1="74" x2="168" y2="214" {...dashedLineProps} />  {/* N–B */}
    <line x1="48" y1="96" x2="162" y2="112" {...lineProps} />         {/* Po–Or */}
    <line x1="72" y1="222" x2="150" y2="254" {...lineProps} />        {/* Go–Me */}
    <line x1="58" y1="138" x2="72" y2="222" {...dashedLineProps} />   {/* Ar–Go */}
    <line x1="84" y1="62" x2="58" y2="138" {...dashedLineProps} />    {/* S–Ar */}
    <line x1="176" y1="74" x2="166" y2="240" {...dashedLineProps} />  {/* N–Pog */}
    {/* Landmarks */}
    <circle cx="84" cy="62" {...dotProps} fill="rgba(255,196,0,.6)" />
    <circle cx="176" cy="74" {...dotProps} fill="rgba(255,196,0,.6)" />
    <circle cx="48" cy="96" {...dotProps} />
    <circle cx="162" cy="112" {...dotProps} />
    <circle cx="58" cy="138" {...dotProps} />
    <circle cx="184" cy="150" {...dotProps} />
    <circle cx="178" cy="172" {...dotProps} fill="rgba(124,209,255,.55)" />
    <circle cx="168" cy="214" {...dotProps} fill="rgba(124,209,255,.55)" />
    <circle cx="166" cy="240" {...dotProps} />
    <circle cx="150" cy="254" {...dotProps} />
    <circle cx="72" cy="222" {...dotProps} />
    {/* Labels for the best-known landmarks */}
    <text x="76" y="52" {...labelProps}>S</text>
    <text x="184" y="68" {...labelProps}>N</text>
    <text x="188" y="176" {...labelProps}>A</text>
    <text x="178" y="220" {...labelProps}>B</text>
    <text x="56" y="234" {...labelProps}>Go</text>
    <text x="148" y="268" {...labelProps}>Me</text>
  </svg>
);

const ErrorIcon = () => (
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

export default class PatientPicker extends React.PureComponent<Props, State> {
  state: State = {
    name: '',
    chartId: '',
    dateOfBirth: '',
    sex: '',
    query: '',
    error: null,
    pendingRemoval: null,
  };

  private register = () => {
    const name = this.state.name.trim();
    const chartId = this.state.chartId.trim();
    if (name === '' && chartId === '') {
      this.setState({
        error: {
          field: 'both',
          message: 'Enter a name or chart ID to register.',
        },
      });
      return;
    }
    const duplicate = chartId !== '' && this.props.patients.some(
      (p) => p.chartId.trim().toLowerCase() === chartId.toLowerCase(),
    );
    if (duplicate) {
      this.setState({
        error: {
          field: 'chartId',
          message: 'This chart ID is already in use.',
        },
      });
      return;
    }
    this.props.onRegister(name, chartId, this.state.dateOfBirth, this.state.sex);
    this.setState({
      name: '',
      chartId: '',
      dateOfBirth: '',
      sex: '',
      query: '',
      error: null,
    });
  };

  private handleKeyDown = (e: React.KeyboardEvent<{}>) => {
    if (e.key === 'Enter') {
      this.register();
    }
  };

  private handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ name: e.currentTarget.value, error: null });
  };

  private handleChartIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ chartId: e.currentTarget.value, error: null });
  };

  private handleDateOfBirthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ dateOfBirth: e.currentTarget.value });
  };

  // Clicking the selected segment again clears the (optional) field.
  private handleSexFemale = () => {
    this.setState(({ sex }) => ({ sex: sex === 'female' ? '' : 'female' }));
  };

  private handleSexMale = () => {
    this.setState(({ sex }) => ({ sex: sex === 'male' ? '' : 'male' }));
  };

  private handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: e.currentTarget.value });
  };

  private requestRemoval(patient: Patient) {
    this.setState({ pendingRemoval: patient });
  }

  private cancelRemoval = () => {
    this.setState({ pendingRemoval: null });
  };

  private confirmRemoval = () => {
    const { pendingRemoval } = this.state;
    if (pendingRemoval !== null) {
      this.props.onRemove(pendingRemoval.id);
    }
    this.setState({ pendingRemoval: null });
  };

  private renderRow(patient: Patient) {
    const { onOpen } = this.props;
    const registered = getRegisteredDate(patient.id);
    const hasBoth = patient.name !== '' && patient.chartId !== '';
    const demographics = getDemographicsLine(patient);
    return (
      <li key={patient.id} className={classes.row_item}>
        <button
          type="button"
          className={classes.row}
          onClick={() => onOpen(patient.id)}
        >
          <span className={classes.avatar} aria-hidden="true">
            {getInitials(patient.name || patient.chartId || '')}
          </span>
          <span className={classes.row_text}>
            <span className={classes.row_name}>
              {patientDisplayName(patient)}
            </span>
            <span className={classes.row_meta}>
              {hasBoth ? (
                <span className={classes.chip}>{patient.chartId}</span>
              ) : null}
              {demographics !== null ? (
                <span className={classes.row_demographics}>{demographics}</span>
              ) : null}
              {registered !== null ? (
                <span className={classes.row_date}>Added {registered}</span>
              ) : null}
            </span>
          </span>
        </button>
        <span className={classes.row_delete}>
          <IconButton
            tooltip="Remove patient"
            style={deleteButtonStyle}
            iconStyle={deleteIconStyle}
            onClick={() => this.requestRemoval(patient)}
          >
            <IconDelete color="#7B8794" hoverColor="#C62828" />
          </IconButton>
        </span>
        <span className={classes.row_chevron} aria-hidden="true">
          <IconArrow color="#A9B4BE" />
        </span>
      </li>
    );
  }

  render() {
    const { patients } = this.props;
    const {
      name, chartId, dateOfBirth, sex, query, error, pendingRemoval,
    } = this.state;

    const nameHasError =
      error !== null && (error.field === 'name' || error.field === 'both');
    const chartIdHasError =
      error !== null && (error.field === 'chartId' || error.field === 'both');
    // The message is anchored under the field it concerns; the "both" case
    // reads under the first (name) field while both inputs are outlined.
    const nameMessage =
      error !== null && (error.field === 'name' || error.field === 'both')
        ? error.message : null;
    const chartIdMessage =
      error !== null && error.field === 'chartId' ? error.message : null;

    const nameInputClass = nameHasError
      ? `${classes.field_input} ${classes.field_input_error}`
      : classes.field_input;
    const chartIdInputClass = chartIdHasError
      ? `${classes.field_input} ${classes.field_input_error}`
      : classes.field_input;
    // The empty date input shows the browser's yyyy/mm/dd scaffold — mute it
    // to placeholder gray so it does not read as an entered value.
    const dobInputClass = dateOfBirth === ''
      ? `${classes.field_input} ${classes.field_input_date} ` +
        classes.field_input_date_empty
      : `${classes.field_input} ${classes.field_input_date}`;
    const now = new Date();
    const todayISO =
      `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    // The typed date restated locale-independently (see the echo below).
    const dobEcho = formatCaptureDate(dateOfBirth);

    const trimmedQuery = query.trim().toLowerCase();
    const visiblePatients = trimmedQuery === ''
      ? patients
      : patients.filter((p) =>
          (p.name || '').toLowerCase().indexOf(trimmedQuery) !== -1 ||
          (p.chartId || '').toLowerCase().indexOf(trimmedQuery) !== -1,
        );

    const dialogActions = [
      (
        <FlatButton
          key="cancel"
          label="Cancel"
          style={cancelButtonStyle}
          labelStyle={cancelLabelStyle}
          onClick={this.cancelRemoval}
        />
      ),
      (
        <RaisedButton
          key="remove"
          label="Remove patient"
          backgroundColor="#C62828"
          labelColor="#FFFFFF"
          className={classes.danger_btn}
          style={removeButtonStyle}
          labelStyle={removeLabelStyle}
          overlayStyle={transparentOverlay}
          onClick={this.confirmRemoval}
        />
      ),
    ];

    return (
      <div className={classes.screen}>
        <div className={classes.card}>
          <aside className={classes.brand}>
            <div className={classes.brand_top}>
              <BrandMark />
              <div>
                <h1 className={classes.brand_name}>WebCeph</h1>
                <p className={classes.brand_tagline}>
                  Cephalometric tracing &amp; analysis
                </p>
              </div>
            </div>
            <div className={classes.brand_art}>
              <BrandConstellation />
            </div>
            <ul className={classes.brand_points}>
              <li>Automatic landmark plotting</li>
              <li>Steiner, Downs, Dental and more</li>
              <li>Projects saved privately on this device</li>
            </ul>
          </aside>

          <div className={classes.main}>
            <h2 className={classes.header_title}>
              Patients
              {patients.length > 0 ? (
                <span className={classes.count_badge}>{patients.length}</span>
              ) : null}
            </h2>
            <p className={classes.header_sub}>
              Select a patient to open their project, or register a new one.
            </p>

            <div className={classes.form}>
              <div className={classes.form_row}>
                <label className={classes.field}>
                  <span className={classes.field_label}>Patient name</span>
                  <input
                    type="text"
                    className={nameInputClass}
                    placeholder="e.g. 山田 太郎"
                    aria-label="Patient name"
                    aria-invalid={nameHasError}
                    value={name}
                    onChange={this.handleNameChange}
                    onKeyDown={this.handleKeyDown}
                  />
                  <span className={classes.field_error} role="alert">
                    {nameMessage !== null ? (
                      <span className={classes.field_error_inner}>
                        <ErrorIcon />
                        {nameMessage}
                      </span>
                    ) : null}
                  </span>
                </label>
                <label className={classes.field}>
                  <span className={classes.field_label}>Chart ID</span>
                  <input
                    type="text"
                    className={chartIdInputClass}
                    placeholder="e.g. C-0001"
                    aria-label="Chart ID"
                    aria-invalid={chartIdHasError}
                    value={chartId}
                    onChange={this.handleChartIdChange}
                    onKeyDown={this.handleKeyDown}
                  />
                  <span className={classes.field_error} role="alert">
                    {chartIdMessage !== null ? (
                      <span className={classes.field_error_inner}>
                        <ErrorIcon />
                        {chartIdMessage}
                      </span>
                    ) : null}
                  </span>
                </label>
              </div>
              <div className={classes.form_row}>
                <label className={`${classes.field} ${classes.field_dob}`}>
                  <span className={classes.field_label}>
                    Date of birth
                    <span className={classes.field_optional}>optional</span>
                  </span>
                  <input
                    type="date"
                    className={dobInputClass}
                    aria-label="Date of birth"
                    max={todayISO}
                    value={dateOfBirth}
                    onChange={this.handleDateOfBirthChange}
                    onKeyDown={this.handleKeyDown}
                  />
                  {/* `input[type=date]` paints in the browser's locale, so US
                      Chrome shows 08/06/2026 — ambiguous on a clinical record.
                      Every display surface in this app writes YYYY/MM/DD, so
                      the parsed value is echoed here in that form. */}
                  <span
                    className={dobEcho !== null
                      ? `${classes.field_echo} ${classes.field_echo_set}`
                      : classes.field_echo}
                  >
                    {dobEcho !== null ? dobEcho : 'YYYY/MM/DD'}
                  </span>
                </label>
                {/* Not a <label>: clicking the caption of a label containing
                    buttons would forward the click to the first button and
                    silently select “Female”. */}
                <div className={classes.field_sex}>
                  <span className={classes.field_label}>
                    Sex
                    <span className={classes.field_optional}>optional</span>
                  </span>
                  <div
                    className={classes.segmented}
                    role="group"
                    aria-label="Sex"
                  >
                    <button
                      type="button"
                      className={sex === 'female'
                        ? `${classes.segment} ${classes.segment_active}`
                        : classes.segment}
                      aria-pressed={sex === 'female'}
                      title={sex === 'female' ? 'Click again to clear' : undefined}
                      onClick={this.handleSexFemale}
                    >
                      Female
                    </button>
                    <button
                      type="button"
                      className={sex === 'male'
                        ? `${classes.segment} ${classes.segment_active}`
                        : classes.segment}
                      aria-pressed={sex === 'male'}
                      title={sex === 'male' ? 'Click again to clear' : undefined}
                      onClick={this.handleSexMale}
                    >
                      Male
                    </button>
                  </div>
                </div>
                <span className={classes.form_spacer} />
                <div className={classes.form_action}>
                  <span className={classes.field_label} aria-hidden="true">
                    &nbsp;
                  </span>
                  <RaisedButton
                    primary
                    label="Register"
                    className={classes.register_btn}
                    labelStyle={registerLabelStyle}
                    overlayStyle={transparentOverlay}
                    onClick={this.register}
                  />
                </div>
              </div>
            </div>

            {/* Always present once a patient exists, so the list block never
                jumps when the search field would otherwise pop in. */}
            {patients.length > 0 ? (
              <div className={classes.search_row}>
                <span className={classes.search_icon}>
                  <IconSearch color="#7B8794" style={{ width: 18, height: 18 }} />
                </span>
                <input
                  type="search"
                  className={classes.search_input}
                  placeholder="Search by name or chart ID"
                  aria-label="Search patients"
                  value={query}
                  onChange={this.handleQueryChange}
                />
              </div>
            ) : null}

            {patients.length === 0 ? (
              <div className={classes.empty}>
                <span className={classes.empty_icon}>
                  <IconPersonOutline
                    color="#7B8794"
                    style={{ width: 28, height: 28 }}
                  />
                </span>
                <span className={classes.empty_title}>No patients yet</span>
                <span className={classes.empty_hint}>
                  Register a patient above to start their first tracing project.
                </span>
              </div>
            ) : visiblePatients.length === 0 ? (
              <div className={classes.empty}>
                <span className={classes.empty_icon}>
                  <IconSearch color="#7B8794" style={{ width: 26, height: 26 }} />
                </span>
                <span className={classes.empty_title}>
                  No patients match “{query.trim()}”
                </span>
                <span className={classes.empty_hint}>
                  Check the spelling, or clear the search to see everyone.
                </span>
              </div>
            ) : (
              <div className={classes.list_wrap}>
                <ul className={classes.list}>
                  {visiblePatients.map((patient) => this.renderRow(patient))}
                </ul>
                {/* A short list leaves the card visibly empty below the last
                    row — fill that space with a quiet workflow hint. */}
                {trimmedQuery === '' && patients.length <= 4 ? (
                  <div className={classes.list_tip}>
                    <span>
                      Tip: press <kbd className={classes.kbd}>Enter</kbd> in the
                      form to register — open a patient to resume their tracing.
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            <div className={classes.footnote}>
              <IconLock color="#A9B4BE" style={{ width: 14, height: 14 }} />
              Patient data stays in this browser — nothing is uploaded.
            </div>
          </div>
        </div>

        <Dialog
          open={pendingRemoval !== null}
          title="Remove patient?"
          titleStyle={dialogTitleStyle}
          bodyStyle={dialogBodyStyle}
          contentStyle={{ width: 440, maxWidth: '90vw' }}
          actionsContainerStyle={dialogActionsStyle}
          paperProps={{ style: dialogPaperStyle }}
          actions={dialogActions}
          onRequestClose={this.cancelRemoval}
        >
          {pendingRemoval !== null ? (
            <span>
              This removes <strong>{patientDisplayName(pendingRemoval)}</strong>
              {pendingRemoval.name !== '' && pendingRemoval.chartId !== ''
                ? ` (${pendingRemoval.chartId})`
                : ''}
              {' '}and their saved project from this browser. This cannot be undone.
            </span>
          ) : null}
        </Dialog>
      </div>
    );
  }
}
