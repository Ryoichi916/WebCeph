import * as React from 'react';

import * as cx from 'classnames';

import FlatButton from 'material-ui/FlatButton';
import IconInfo from 'material-ui/svg-icons/action/info-outline';
import IconRecords from 'material-ui/svg-icons/action/view-list';
import IconEdit from 'material-ui/svg-icons/image/edit';
import IconDelete from 'material-ui/svg-icons/action/delete';
import IconZoomIn from 'material-ui/svg-icons/action/zoom-in';
import IconZoomOut from 'material-ui/svg-icons/action/zoom-out';
import IconZoomFit from 'material-ui/svg-icons/maps/zoom-out-map';
import IconPrev from 'material-ui/svg-icons/navigation/chevron-left';
import IconNext from 'material-ui/svg-icons/navigation/chevron-right';

import Props from './props';

import { PatientRecord } from 'store/reducers/workspace';

import EditRecordDialog from 'components/RecordMetaFields/EditRecordDialog';
import RemoveRecordDialog from 'components/RecordMetaFields/RemoveRecordDialog';

import {
  getImageTypeLabel,
  getImageTypeShortLabel,
  formatCaptureDate,
} from 'utils/records';

const classes = require('./style.scss');

const iconStyle: React.CSSProperties = { width: 18, height: 18 };

/** Same bounds and step as the tracing canvas's zoom controls. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

interface State {
  /**
   * `null` means "fitted to the window". A number is the fraction of the
   * image's natural size (1 = one image pixel per screen pixel) — stated that
   * way in the readout's tooltip so the percentage means something exact.
   */
  zoom: number | null;
  isEditOpen: boolean;
  isRemoveOpen: boolean;
}

/**
 * The editor state for an image that is part of the patient's record but is
 * not a lateral cephalogram: a frontal ceph, a panoramic film, a profile or
 * intraoral photograph.
 *
 * These are displayed, never analysed. Every implemented analysis in this app
 * is defined on lateral-ceph landmarks, so instead of handing the user a
 * stepper that could never complete, this view shows the image with its record
 * metadata and says plainly what is and is not available.
 *
 * It keeps the editor's 44px bottom strip (with only the controls that apply
 * here — zoom out / % / zoom in / fit), so a 2000px panoramic can be read at
 * full size and switching rail tiles does not shift the canvas height.
 */
export default class RecordViewer extends React.PureComponent<Props, State> {
  state: State = {
    zoom: null,
    isEditOpen: false,
    isRemoveOpen: false,
  };

  componentWillReceiveProps(next: Props) {
    // A different film starts fitted, not at the previous film's zoom.
    if (next.imageId !== this.props.imageId) {
      this.setState({ zoom: null });
    }
  }

  render() {
    const {
      className, src, name, type, timepoint, captureDate, width, height,
      records, imageId, onOpenRecordsClick,
    } = this.props;
    const { zoom } = this.state;
    const typeLabel = getImageTypeLabel(type);
    const dateLabel = formatCaptureDate(captureDate);
    const index = records.map((r) => r.imageId).indexOf(imageId);
    const current = index >= 0 ? records[index] : undefined;
    const previous = index > 0 ? records[index - 1] : undefined;
    const next = index >= 0 && index < records.length - 1
      ? records[index + 1]
      : undefined;
    // Fitted: the browser scales the image down to the viewport. Zoomed: the
    // image is laid out at its own pixels × zoom and the viewport scrolls.
    const imageStyle: React.CSSProperties = zoom === null
      ? { }
      : {
        maxWidth: 'none',
        maxHeight: 'none',
        width: width !== null ? Math.round(width * zoom) : undefined,
        height: height !== null ? Math.round(height * zoom) : undefined,
      };
    return (
      <div className={cx(classes.root, className)}>
        <div className={classes.canvas}>
          <div className={cx(classes.viewport, {
            [classes.viewport__zoomed]: zoom !== null,
          })}>
            {src !== null ? (
              <img
                className={classes.image}
                style={imageStyle}
                src={src}
                alt={name || typeLabel}
              />
            ) : (
              <span className={classes.no_image}>Image data unavailable</span>
            )}
          </div>
          <div className={classes.toolbar} role="toolbar" aria-label="View controls">
            <div className={classes.zoom_group} role="group" aria-label="Zoom">
              <button
                type="button"
                className={cx(classes.tool_button, classes.tool_button__icon)}
                disabled={zoom === null || zoom <= ZOOM_MIN}
                title={zoom === null
                  ? 'Already fitted to the window'
                  : 'Zoom out'}
                aria-label="Zoom out"
                onClick={this.zoomOut}
              >
                <IconZoomOut color="currentColor" style={iconStyle} />
              </button>
              <button
                type="button"
                className={cx(classes.tool_button, classes.zoom_value)}
                title="Show the image at its own pixels (100% = 1 image pixel per screen pixel)"
                aria-label="Show at 100%"
                onClick={this.zoomActual}
              >
                {zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}
              </button>
              <button
                type="button"
                className={cx(classes.tool_button, classes.tool_button__icon)}
                disabled={zoom !== null && zoom >= ZOOM_MAX}
                title="Zoom in"
                aria-label="Zoom in"
                onClick={this.zoomIn}
              >
                <IconZoomIn color="currentColor" style={iconStyle} />
              </button>
              <span className={classes.zoom_divider} />
              <button
                type="button"
                className={cx(classes.tool_button, classes.tool_button__icon)}
                disabled={zoom === null}
                title="Fit image to the window"
                aria-label="Fit image to the window"
                onClick={this.zoomFit}
              >
                <IconZoomFit color="currentColor" style={iconStyle} />
              </button>
            </div>
            <span className={classes.toolbar_note}>
              {/* Say why the tracing tools are absent instead of showing a row
                  of disabled labels. */}
              View only — {typeLabel.toLowerCase()}s are not traced
            </span>
          </div>
        </div>
        <aside className={classes.panel} aria-label="Record details">
          <header className={classes.panel_head}>
            <span className={classes.panel_eyebrow}>Record image</span>
            <h2 className={classes.panel_title}>{typeLabel}</h2>
          </header>
          <dl className={classes.meta}>
            <div className={classes.meta_row}>
              <dt className={classes.meta_key}>Timepoint</dt>
              <dd className={classes.meta_value}>
                {timepoint !== null ? timepoint : (
                  <span className={classes.meta_unset}>Not recorded</span>
                )}
              </dd>
            </div>
            <div className={classes.meta_row}>
              <dt className={classes.meta_key}>Capture date</dt>
              <dd className={cx(classes.meta_value, classes.meta_value__num)}>
                {dateLabel !== null ? dateLabel : (
                  <span className={classes.meta_unset}>Not recorded</span>
                )}
              </dd>
            </div>
            <div className={classes.meta_row}>
              <dt className={classes.meta_key}>File</dt>
              <dd className={classes.meta_value} title={name || undefined}>
                {name !== null ? name : (
                  <span className={classes.meta_unset}>Unnamed</span>
                )}
              </dd>
            </div>
            <div className={classes.meta_row}>
              <dt className={classes.meta_key}>Pixels</dt>
              <dd className={cx(classes.meta_value, classes.meta_value__num)}>
                {width !== null && height !== null ? (
                  `${width} × ${height}`
                ) : (
                  <span className={classes.meta_unset}>Unknown</span>
                )}
              </dd>
            </div>
          </dl>
          {/* Record metadata is correctable from here as well as from the
              dashboard: this is the surface a mis-typed film lands on. */}
          <div className={classes.panel_actions}>
            <button
              type="button"
              className={classes.panel_action}
              onClick={this.openEdit}
            >
              <IconEdit color="#1565C0" style={iconStyle} />
              Edit details
            </button>
            <button
              type="button"
              className={cx(classes.panel_action, classes.panel_action__danger)}
              disabled={current === undefined}
              onClick={this.openRemove}
            >
              <IconDelete color="#C62828" style={iconStyle} />
              Remove from record
            </button>
          </div>
          <div className={classes.note}>
            <span className={classes.note_icon} aria-hidden="true">
              <IconInfo color="#B26A00" style={iconStyle} />
            </span>
            <div className={classes.note_body}>
              <strong className={classes.note_title}>Not cephalometrically analysable</strong>
              <p className={classes.note_text}>
                This image is kept as part of the patient's record. Landmark
                tracing, analyses and the clinical report are available on
                lateral cephalograms only — every analysis this app ships
                (Downs, Steiner, Tweed, Ricketts, Björk, Jarabak, dental, soft
                tissue, Wits) is defined on lateral-ceph landmarks.
              </p>
              <p className={classes.note_text}>
                If this film <em>is</em> a lateral cephalogram, correct its type
                with Edit details above and it becomes traceable.
              </p>
            </div>
          </div>

          {records.length > 1 ? (
            <section className={classes.context}>
              <div className={classes.context_head}>
                <span className={classes.context_title}>
                  This patient's timepoints
                </span>
                <span className={classes.context_nav}>
                  <button
                    type="button"
                    className={classes.nav_button}
                    disabled={previous === undefined}
                    title={previous !== undefined
                      ? `Previous record: ${describe(previous)}`
                      : 'This is the earliest record'}
                    aria-label="Previous record"
                    onClick={this.openSibling(previous)}
                  >
                    <IconPrev color="currentColor" style={iconStyle} />
                  </button>
                  <button
                    type="button"
                    className={classes.nav_button}
                    disabled={next === undefined}
                    title={next !== undefined
                      ? `Next record: ${describe(next)}`
                      : 'This is the latest record'}
                    aria-label="Next record"
                    onClick={this.openSibling(next)}
                  >
                    <IconNext color="currentColor" style={iconStyle} />
                  </button>
                </span>
              </div>
              <ul className={classes.context_list}>
                {records.map((record) => (
                  <li key={record.imageId}>
                    <button
                      type="button"
                      className={cx(classes.context_item, {
                        [classes.context_item__current]: record.imageId === imageId,
                      })}
                      disabled={record.imageId === imageId}
                      title={`Open ${describe(record)}`}
                      onClick={this.openSibling(record)}
                    >
                      <span className={classes.context_thumb}>
                        {record.thumbnail !== null ? (
                          <img
                            className={classes.context_thumb_img}
                            src={record.thumbnail}
                            alt=""
                            draggable={false}
                          />
                        ) : null}
                      </span>
                      <span className={classes.context_text}>
                        <span className={classes.context_label}>
                          {record.timepoint !== null
                            ? record.timepoint
                            : getImageTypeShortLabel(record.type)}
                          {record.imageId === imageId ? (
                            <span className={classes.context_current_tag}>
                              shown
                            </span>
                          ) : null}
                        </span>
                        <span className={classes.context_sub}>
                          {getImageTypeShortLabel(record.type)}
                          {formatCaptureDate(record.captureDate) !== null
                            ? ` · ${formatCaptureDate(record.captureDate)}`
                            : ''}
                        </span>
                      </span>
                      {record.isTraceable ? (
                        <span className={classes.context_flag}>Traceable</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <FlatButton
            primary
            label="Open patient records"
            icon={<IconRecords color="#1565C0" style={iconStyle} />}
            labelStyle={{ textTransform: 'none', fontWeight: 600, fontSize: 13.5 }}
            onClick={onOpenRecordsClick}
          />
        </aside>

        <EditRecordDialog
          open={this.state.isEditOpen}
          initialValue={{ type, timepoint, captureDate }}
          fileName={name}
          onSave={this.handleSaveMeta}
          onCancel={this.closeEdit}
        />
        <RemoveRecordDialog
          open={this.state.isRemoveOpen}
          type={type}
          timepoint={timepoint}
          captureDate={captureDate}
          fileName={name}
          landmarksPlaced={current !== undefined ? current.landmarksPlaced : 0}
          onConfirm={this.handleConfirmRemove}
          onCancel={this.closeRemove}
        />
      </div>
    );
  }

  private zoomIn = () => {
    const { zoom } = this.state;
    this.setState({
      zoom: zoom === null ? 1 : Math.min(zoom * ZOOM_STEP, ZOOM_MAX),
    });
  };

  private zoomOut = () => {
    const { zoom } = this.state;
    if (zoom === null) {
      return;
    }
    this.setState({ zoom: Math.max(zoom / ZOOM_STEP, ZOOM_MIN) });
  };

  private zoomActual = () => this.setState({ zoom: 1 });
  private zoomFit = () => this.setState({ zoom: null });

  private openEdit = () => this.setState({ isEditOpen: true });
  private closeEdit = () => this.setState({ isEditOpen: false });

  private handleSaveMeta = (meta: ImageRecordMeta) => {
    this.setState({ isEditOpen: false });
    this.props.onSaveMeta(meta);
  };

  private openRemove = () => this.setState({ isRemoveOpen: true });
  private closeRemove = () => this.setState({ isRemoveOpen: false });

  private handleConfirmRemove = () => {
    const { records, imageId, onRemoveRecord } = this.props;
    const record = records.filter((r) => r.imageId === imageId)[0];
    this.setState({ isRemoveOpen: false });
    if (record === undefined) {
      return;
    }
    const fallback = records
      .filter((r) => r.workspaceId !== record.workspaceId)
      .map((r) => r.workspaceId)[0];
    onRemoveRecord(record, fallback !== undefined ? fallback : null);
  };

  private openSibling = (record: PatientRecord | undefined) => () => {
    if (record !== undefined && record.imageId !== this.props.imageId) {
      this.props.onOpenRecord(record);
    }
  };
}

/** One-line identity of a record for tooltips: `T2 · Panoramic · 2026/03/19`. */
const describe = (record: PatientRecord): string =>
  [
    record.timepoint,
    getImageTypeLabel(record.type),
    formatCaptureDate(record.captureDate),
  ].filter((part) => part !== null).join(' · ');
