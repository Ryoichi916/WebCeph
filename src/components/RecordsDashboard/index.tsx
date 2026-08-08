import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import IconClose from 'material-ui/svg-icons/navigation/close';
import IconChevron from 'material-ui/svg-icons/navigation/chevron-right';
import IconEdit from 'material-ui/svg-icons/image/edit';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconAdd from 'material-ui/svg-icons/content/add';

import Props from './props';

import { PatientRecord } from 'store/reducers/workspace';

import EditRecordDialog from 'components/RecordMetaFields/EditRecordDialog';
import RemoveRecordDialog from 'components/RecordMetaFields/RemoveRecordDialog';

import { formatMmPx } from 'components/TracingToolbar/CalibrationDialog';

import {
  formatAgeFull,
  formatSexFull,
} from 'utils/patient';

import {
  getImageTypeLabel,
  formatCaptureDate,
  formatDisplayDate,
  parseCaptureDate,
} from 'utils/records';

import { getNameForAnalysis } from 'components/AnalysisSelector/strings';

const classes = require('./style.scss');

const dialogContentStyle: React.CSSProperties = {
  width: '92%',
  maxWidth: 940,
};

const dialogBodyStyle: React.CSSProperties = {
  padding: 0,
  borderTop: '1px solid #DDE3EA',
};

const dialogActionsStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderTop: '1px solid #DDE3EA',
};

const actionIconStyle: React.CSSProperties = { width: 18, height: 18 };

/**
 * A calm line illustration for the empty state: an empty records folder with a
 * film card sliding in beside it. The card is offset and tilted clear of the
 * folder body and carries a white halo, so the two shapes read as two objects
 * rather than one blob; the landmark dots are large enough to be seen.
 */
const EmptyIllustration = () => (
  <svg
    className={classes.empty_art}
    width="188"
    height="136"
    viewBox="0 0 188 136"
    aria-hidden="true"
  >
    {/* folder: back panel with its tab on the far left (clear of the card),
        plus a front pocket that gives it depth */}
    <path
      className={classes.empty_folder}
      d="M14 58 a6 6 0 0 1 6 -6 h24 l7 9 h61 a6 6 0 0 1 6 6 v51
         a6 6 0 0 1 -6 6 H20 a6 6 0 0 1 -6 -6 Z"
    />
    <path
      className={classes.empty_pocket}
      d="M14 80 h104 v38 a6 6 0 0 1 -6 6 H20 a6 6 0 0 1 -6 -6 Z"
    />
    {/* film card, tilted out of the folder */}
    <g transform="rotate(9 142 62)">
      <rect x="112" y="24" width="60" height="78" rx="6" className={classes.empty_halo} />
      <rect x="112" y="24" width="60" height="78" rx="6" className={classes.empty_card} />
      <path
        className={classes.empty_profile}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M138 36 c5 6 6 12 5 17 c-1 4 -4 7 -7 9 c4 3 6 6 5 10 c-1 4 -4 6 -7 8
           c3 3 4 6 2 9 c-2 4 -8 7 -13 7"
      />
      <g className={classes.empty_dots}>
        <circle cx="138" cy="36" r="3" />
        <circle cx="136" cy="62" r="3" />
        <circle cx="136" cy="80" r="3" />
      </g>
    </g>
  </svg>
);

/**
 * The tracing-progress chip for one record — never overstates what exists.
 * The counts are landmarks, and say so: the analysis stepper counts every step
 * of the analysis (landmarks plus the lines and angles computed from them), so
 * an unlabelled "10 of 10" beside the stepper's "32/32" would read as a
 * contradiction.
 */
const StatusChip = ({ record }: { record: PatientRecord }) => {
  if (!record.isTraceable) {
    return (
      <span className={cx(classes.chip, classes.chip__muted)}>
        View only · not analysable
      </span>
    );
  }
  const { landmarksPlaced, landmarksRequired } = record;
  if (landmarksRequired === 0) {
    return (
      <span className={cx(classes.chip, classes.chip__muted)}>No analysis set</span>
    );
  }
  if (landmarksPlaced === 0) {
    return (
      <span className={cx(classes.chip, classes.chip__muted)}>
        Not traced · 0 of {landmarksRequired} landmarks
      </span>
    );
  }
  if (landmarksPlaced >= landmarksRequired) {
    return (
      <span className={cx(classes.chip, classes.chip__ok)}>
        Tracing complete · {landmarksRequired} of {landmarksRequired} landmarks
      </span>
    );
  }
  return (
    <span className={cx(classes.chip, classes.chip__partial)}>
      Partly traced · {landmarksPlaced} of {landmarksRequired} landmarks
    </span>
  );
};

interface State {
  /** Image id whose details are being edited, or null. */
  editingImageId: string | null;
  /** Image id queued for removal (awaiting confirmation), or null. */
  removingImageId: string | null;
}

/**
 * The patient's records dashboard: demographics header plus a timeline of every
 * image on file. Each card opens that image in the editor, and each carries the
 * two recovery actions the record needs — correct the details, or drop the
 * image.
 *
 * Everything shown is read off the store — a card never claims a timepoint, a
 * capture date or a tracing that is not actually recorded.
 */
export default class RecordsDashboard extends React.PureComponent<Props, State> {
  state: State = {
    editingImageId: null,
    removingImageId: null,
  };

  render() {
    const { open, patient, records, onRequestClose } = this.props;
    const name = patient !== null
      ? (patient.name || patient.chartId || '(unnamed patient)')
      : '—';
    const age = patient !== null ? formatAgeFull(patient.dateOfBirth) : null;
    const sex = patient !== null ? formatSexFull(patient.sex) : null;
    // ISO, from the app's one date formatter: this panel showed `1998/04/12`
    // while the printed report showed `1998-04-12` for the same patient.
    const dob = patient !== null ? formatDisplayDate(patient.dateOfBirth) : null;
    return (
      <Dialog
        open={open}
        onRequestClose={onRequestClose}
        title={
          <div className={classes.title}>
            <div className={classes.title_text}>
              <div className={classes.title_row}>
                <h3 className={classes.title_heading}>Patient records</h3>
                <span className={classes.title_badge}>
                  {records.length === 1 ? '1 image' : `${records.length} images`}
                </span>
              </div>
              <span className={classes.title_caption}>
                Every image on file for this patient, oldest first
              </span>
            </div>
            <button
              type="button"
              className={classes.close_button}
              aria-label="Close"
              onClick={onRequestClose}
            >
              <IconClose color="#7B8794" style={{ width: 20, height: 20 }} />
            </button>
          </div>
        }
        actions={[
          <div key="actions" className={classes.actions}>
            <span className={classes.actions_note}>{this.getTraceableNote()}</span>
            <span className={classes.actions_buttons}>
              {records.length > 0 ? (
                <FlatButton
                  label="Add image"
                  icon={<IconAdd color="#52616F" style={actionIconStyle} />}
                  labelStyle={{ textTransform: 'none', fontWeight: 500, color: '#1F2933' }}
                  onClick={this.handleAddImage}
                />
              ) : null}
              <FlatButton
                primary
                label="Close"
                labelStyle={{ textTransform: 'none', fontWeight: 600 }}
                onClick={onRequestClose}
              />
            </span>
          </div>,
        ]}
        contentStyle={dialogContentStyle}
        bodyStyle={dialogBodyStyle}
        actionsContainerStyle={dialogActionsStyle}
        autoScrollBodyContent
      >
        <div className={classes.root}>
          <header className={classes.patient}>
            <span className={classes.patient_avatar} aria-hidden="true">
              {getInitials(name)}
            </span>
            <div className={classes.patient_text}>
              <h4 className={classes.patient_name}>{name}</h4>
              <div className={classes.patient_meta}>
                {patient !== null && patient.chartId ? (
                  <span className={classes.patient_chart}>{patient.chartId}</span>
                ) : null}
                <MetaItem label="Date of birth" value={dob} />
                <MetaItem label="Age today" value={age} />
                <MetaItem label="Sex" value={sex} />
              </div>
            </div>
          </header>

          {records.length === 0 ? (
            <div className={classes.empty}>
              <EmptyIllustration />
              <p className={classes.empty_title}>No images on file yet</p>
              <p className={classes.empty_hint}>
                Add a lateral cephalogram to start tracing. Frontal films,
                panoramics and photographs can be filed alongside it.
              </p>
              <span className={classes.empty_action}>
                <RaisedButton
                  primary
                  label="Add image"
                  icon={<IconAdd color="#FFFFFF" style={actionIconStyle} />}
                  labelStyle={{ textTransform: 'none', fontWeight: 600 }}
                  onClick={this.handleAddImage}
                />
              </span>
            </div>
          ) : (
            <ol className={classes.timeline}>
              {/* One rail for the whole timeline, drawn from the first node
                  down to the last (the tail below the last node is masked by
                  that entry's gutter) — never one stub per card. */}
              <span className={classes.timeline_rail} aria-hidden="true" />
              {records.map((record) => this.renderRecord(record))}
            </ol>
          )}
        </div>
        {this.renderDialogs()}
      </Dialog>
    );
  }

  /**
   * The footer note. Both branches are grammatical for one image as well as
   * many — a clinical surface cannot ship "0 of 1 images are …".
   */
  private getTraceableNote = (): string => {
    const { records } = this.props;
    const total = records.length;
    const traceable = records.filter((r) => r.isTraceable).length;
    if (total === 0) {
      return 'Tracing and analyses are available on lateral cephalograms.';
    }
    if (traceable === total) {
      return total === 1
        ? 'The image on file is a lateral cephalogram and can be traced.'
        : `All ${total} images are lateral cephalograms and can be traced.`;
    }
    const noun = total === 1 ? 'image' : 'images';
    return `${traceable} of ${total} ${noun} can be traced — tracing is offered ` +
      'on lateral cephalograms only.';
  };

  private renderRecord = (record: PatientRecord) => {
    const { patient } = this.props;
    const dateLabel = formatCaptureDate(record.captureDate);
    const typeLabel = getImageTypeLabel(record.type);
    const analysisName = record.analysisId !== null
      ? getNameForAnalysis(record.analysisId)
      : null;
    const captureDate = parseCaptureDate(record.captureDate);
    // The patient's age on the day this film was taken — the number a growth
    // assessment needs. Absent unless both the date of birth and the capture
    // date are actually recorded.
    const ageAtCapture = (patient !== null && captureDate !== null)
      ? formatAgeFull(patient.dateOfBirth, captureDate)
      : null;
    const identity = [record.timepoint, typeLabel, dateLabel]
      .filter((part) => part !== null).join(' · ');
    return (
      <li key={record.imageId} className={classes.entry}>
        <div className={classes.entry_when}>
          <span className={classes.entry_date}>
            {dateLabel !== null ? dateLabel : (
              <span className={classes.entry_date_unset}>No date</span>
            )}
          </span>
          <span className={classes.entry_node} aria-hidden="true" />
        </div>
        <div
          className={cx(classes.card, {
            [classes.card__active]: record.isActive,
          })}
        >
          <button
            type="button"
            className={classes.card_open}
            onClick={this.handleOpen(record)}
            title={`Open ${identity} in the editor`}
          >
            <span className={classes.thumb}>
              {record.thumbnail !== null ? (
                <img
                  className={classes.thumb_img}
                  src={record.thumbnail}
                  alt=""
                  draggable={false}
                />
              ) : null}
            </span>
            <span className={classes.card_body}>
              <span className={classes.card_head}>
                {record.timepoint !== null ? (
                  <span className={classes.timepoint} title={record.timepoint}>
                    {record.timepoint}
                  </span>
                ) : (
                  <span className={cx(classes.timepoint, classes.timepoint__unset)}>
                    No timepoint
                  </span>
                )}
                <span className={classes.card_type}>{typeLabel}</span>
                {record.isActive ? (
                  <span className={cx(classes.chip, classes.chip__active)}>
                    Open in editor
                  </span>
                ) : null}
              </span>
              <span className={classes.card_chips}>
                <StatusChip record={record} />
                {analysisName !== null ? (
                  <span className={cx(classes.chip, classes.chip__info)}>
                    {/* Before anything is placed the analysis is only what this
                        film *would* be measured with, not a finding. */}
                    {record.landmarksPlaced > 0
                      ? `Analysis · ${analysisName}`
                      : `Will use · ${analysisName}`}
                  </span>
                ) : null}
                {record.isTraceable ? (
                  <span
                    className={cx(classes.chip, {
                      [classes.chip__ok]: record.isCalibrated,
                      [classes.chip__muted]: !record.isCalibrated,
                    })}
                  >
                    {record.isCalibrated ? 'Calibrated' : 'Not calibrated'}
                  </span>
                ) : null}
              </span>
              {record.name !== null ? (
                <span className={classes.card_file} title={record.name}>
                  {record.name}
                </span>
              ) : null}
            </span>
            {/* Right-hand facts column: what the file actually is. Every value
                is read off the store; a row is omitted, not guessed. */}
            <span className={classes.card_facts}>
              <FactRow
                label="Pixels"
                value={record.width !== null && record.height !== null
                  ? `${record.width} × ${record.height}`
                  : null}
              />
              <FactRow
                label="Scale"
                value={record.scaleFactor !== null
                  ? `${formatMmPx(record.scaleFactor, 3)} mm/px`
                  : (record.isTraceable ? 'Not calibrated' : null)}
                muted={record.scaleFactor === null}
              />
              <FactRow label="Age at film" value={ageAtCapture} />
            </span>
            <span className={classes.card_go} aria-hidden="true">
              <IconChevron color="#7B8794" style={{ width: 22, height: 22 }} />
            </span>
          </button>
          <span className={classes.card_actions}>
            <button
              type="button"
              className={classes.icon_button}
              title={`Edit the record details of ${identity}`}
              aria-label={`Edit details of ${identity}`}
              onClick={this.handleEditClick(record)}
            >
              <IconEdit color="currentColor" style={actionIconStyle} />
            </button>
            <button
              type="button"
              className={cx(classes.icon_button, classes.icon_button__danger)}
              title={`Remove ${identity} from this patient's record`}
              aria-label={`Remove ${identity} from the record`}
              onClick={this.handleRemoveClick(record)}
            >
              <IconDelete color="currentColor" style={actionIconStyle} />
            </button>
          </span>
        </div>
      </li>
    );
  };

  private renderDialogs = () => {
    const { records } = this.props;
    const { editingImageId, removingImageId } = this.state;
    const editing = records.filter((r) => r.imageId === editingImageId)[0];
    const removing = records.filter((r) => r.imageId === removingImageId)[0];
    return (
      <div>
        <EditRecordDialog
          open={editing !== undefined}
          initialValue={editing !== undefined ? {
            type: editing.type,
            timepoint: editing.timepoint,
            captureDate: editing.captureDate,
          } : { type: null, timepoint: null, captureDate: null }}
          fileName={editing !== undefined ? editing.name : null}
          onSave={this.handleSaveMeta}
          onCancel={this.closeEdit}
        />
        <RemoveRecordDialog
          open={removing !== undefined}
          type={removing !== undefined ? removing.type : null}
          timepoint={removing !== undefined ? removing.timepoint : null}
          captureDate={removing !== undefined ? removing.captureDate : null}
          fileName={removing !== undefined ? removing.name : null}
          landmarksPlaced={removing !== undefined ? removing.landmarksPlaced : 0}
          onConfirm={this.handleConfirmRemove}
          onCancel={this.closeRemove}
        />
      </div>
    );
  };

  private handleOpen = (record: PatientRecord) => () =>
    this.props.onOpenRecord(record);

  private handleAddImage = () => this.props.onAddImage(this.props.emptyWorkspaceId);

  private handleEditClick = (record: PatientRecord) => () =>
    this.setState({ editingImageId: record.imageId });

  private closeEdit = () => this.setState({ editingImageId: null });

  private handleSaveMeta = (meta: ImageRecordMeta) => {
    const { editingImageId } = this.state;
    const record = this.props.records.filter((r) => r.imageId === editingImageId)[0];
    if (record !== undefined) {
      this.props.onSaveRecordMeta(record, meta);
    }
    this.setState({ editingImageId: null });
  };

  private handleRemoveClick = (record: PatientRecord) => () =>
    this.setState({ removingImageId: record.imageId });

  private closeRemove = () => this.setState({ removingImageId: null });

  private handleConfirmRemove = () => {
    const { removingImageId } = this.state;
    const { records } = this.props;
    const record = records.filter((r) => r.imageId === removingImageId)[0];
    if (record !== undefined) {
      // Another record's rail tile to land on, if the patient has one.
      const fallback = records
        .filter((r) => r.workspaceId !== record.workspaceId)
        .map((r) => r.workspaceId)[0];
      this.props.onRemoveRecord(record, fallback !== undefined ? fallback : null);
    }
    this.setState({ removingImageId: null });
  };
}

/** A `label: value` pair in the demographics line; hidden when unrecorded. */
const MetaItem = ({ label, value }: { label: string; value: string | null }) => {
  if (value === null) {
    return null;
  }
  return (
    <span className={classes.patient_meta_item}>
      <span className={classes.patient_meta_key}>{label}</span>
      <span className={classes.patient_meta_value}>{value}</span>
    </span>
  );
};

/** One right-aligned fact on a record card; renders nothing without a value. */
const FactRow = (
  { label, value, muted = false }:
  { label: string; value: string | null; muted?: boolean },
) => {
  if (value === null) {
    return null;
  }
  return (
    <span className={classes.fact}>
      <span className={classes.fact_key}>{label}</span>
      <span className={cx(classes.fact_value, { [classes.fact_value__muted]: muted })}>
        {value}
      </span>
    </span>
  );
};

/**
 * Initials for the avatar: first character for CJK names (山田 太郎 → 山),
 * first letters of the first two words otherwise. Mirrors PatientBar.
 */
const getInitials = (text: string): string => {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return '';
  }
  if (/[　-〿぀-ヿ㐀-鿿豈-﫿]/.test(tokens[0])) {
    return tokens[0].charAt(0);
  }
  return tokens.slice(0, 2).map((t) => t.charAt(0).toUpperCase()).join('');
};
