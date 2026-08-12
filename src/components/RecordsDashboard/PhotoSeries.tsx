import * as React from 'react';

import * as cx from 'classnames';

import { PatientRecord } from 'store/reducers/workspace';

import {
  buildPhotoSeries,
  formatCaptureDate,
  getImageTypeLabel,
  getPhotoViewLabel,
  getPhotoViewShortLabel,
  getPhotoViewLabelInSentence,
  getTimepointToken,
  PhotoSeriesCell,
  PhotoViewOption,
  TimepointGroup,
} from 'utils/records';

const classes = require('./photoseries.scss');

/** The `+` on an empty cell — the slot row's own mark, at cell size. */
const CellPlus = () => (
  <svg
    className={classes.cell_plus}
    width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
  >
    <path
      d="M6 1.5 V10.5 M1.5 6 H10.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export interface PhotoSeriesProps {
  /**
   * The visit these photographs were taken at. Used for the wording of what an
   * empty cell will file ("Add the upper occlusal photograph to T2 · 2026-06-18")
   * and for nothing else — the grid itself is placed by each photograph's own
   * recorded position.
   */
  group: TimepointGroup<PatientRecord>;
  /**
   * The visit's records. Non-photographs are ignored here (they are the cards
   * above this tile), so callers hand the group over whole.
   */
  records: PatientRecord[];
  /**
   * `panel` — the visit's own tile on the records page: a head, empty positions
   * that accept an upload, and the unplaced strip.
   * `compare` — the same grid inside the comparison viewer: read-only, no head,
   * no filing. One component either way, so a visit's series cannot be laid out
   * one way on the page and another in the view that compares it.
   */
  variant?: 'panel' | 'compare';
  /** Whether the record has photographs at another visit to compare against. */
  canCompare?: boolean;
  /** Enlarge one photograph in the read-only photograph viewer. */
  onOpenPhoto(record: PatientRecord): any;
  /** File an upload at exactly this position of this visit. */
  onFill?(view: PhotoViewOption): any;
  /** Open the comparison, on this position where one is named. */
  onCompare?(view: PhotoView | null): any;
  /** Correct one photograph's record details — the unplaced strip's own action. */
  onEdit?(record: PatientRecord): any;
}

/**
 * A visit's photographs as the composite series a clinician reads — the standard
 * orthodontic photographic series, in the positions it is shot in.
 *
 * **Why a grid and not rows.** A photographic series is read *as a composite*:
 * facial symmetry against the profile, the buccal segments against each other and
 * against the centre, the two arches under them. Listed as one row per file — a
 * name, a chip and a 112px thumbnail each — the record held the photographs and
 * gave a clinician no way to read the series, and "what is missing from this
 * visit's photographs" was five words in a coverage pane instead of five empty
 * frames in the shape of the thing itself.
 *
 * **Every cell is a position, filled or not.** A filled cell shows the photograph
 * contained (never cropped) in a frame shaped like the way that frame is shot —
 * facial portrait, intraoral landscape — with the position named under it. An
 * empty cell is a quiet dashed placeholder that files an upload at *that*
 * position: the upload form opens already stating the frame, the type it belongs
 * to, the visit and the visit's day.
 *
 * **Nothing here is traceable and nothing pretends to be.** A photograph opens in
 * the read-only viewer; no cell offers tracing, an analysis or a measurement, and
 * no landmark is ever plotted on one.
 */
export default class PhotoSeries extends React.PureComponent<PhotoSeriesProps> {
  render() {
    const { records, canCompare } = this.props;
    const isCompare = this.props.variant === 'compare';
    const series = buildPhotoSeries(records);
    const visit = this.visitName();
    return (
      <div
        className={cx(classes.series, {
          [classes.series__compare]: isCompare,
        })}
      >
        {isCompare ? null : (
          <div className={classes.series_head}>
            <span className={classes.series_title}>Photographic series</span>
            <span className={classes.series_count}>
              {series.filled} of {series.rows.reduce(
                (n, { cells }) => n + cells.length, 0,
              )} positions
            </span>
            {/* The comparison this tile is a half of. Offered only where there
                is a second visit with photographs to compare against — a control
                that opens a comparison of one visit with itself is not a
                control. */}
            {canCompare === true && this.props.onCompare !== undefined ? (
              <button
                type="button"
                className={classes.series_compare}
                title={`Compare ${visit}'s photographs with the other visits'`}
                onClick={this.handleCompareAll}
              >
                Compare visits
              </button>
            ) : null}
          </div>
        )}
        {series.rows.map(({ row, cells }) => (
          <div key={row.key} className={classes.band}>
            <span className={classes.band_label}>{row.label}</span>
            <div
              className={cx(classes.band_cells, classes[`band_cells__${row.key}`])}
            >
              {cells.map((cell) => this.renderCell(cell, isCompare))}
            </div>
          </div>
        ))}
        {/* Photographs the record holds but does not place: filed before this
            app recorded a position, or left without one by a type correction.
            They are listed, never guessed into a cell — "Intraoral photograph"
            is five different photographs — and each carries the one action that
            closes the gap. */}
        {series.unplaced.length > 0 ? (
          <div className={classes.unplaced}>
            <span className={classes.unplaced_label}>
              {series.unplaced.length === 1
                ? '1 photograph with no position recorded'
                : `${series.unplaced.length} photographs with no position recorded`}
            </span>
            <div className={classes.unplaced_list}>
              {series.unplaced.map((record) => this.renderUnplaced(record, isCompare))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  /** How this visit is named in a sentence — its series token, or a phrase. */
  private visitName = (): string => {
    const { group } = this.props;
    const token = getTimepointToken(group.label);
    return token !== null ? token : 'this visit';
  };

  /** The day an upload filed here will be stamped with, where the visit has one. */
  private visitDay = (): string => {
    const { group } = this.props;
    return group.firstDate !== null ? ` · ${group.firstDate}` : '';
  };

  private renderCell = (
    cell: PhotoSeriesCell<PatientRecord>, isCompare: boolean,
  ) => {
    const { view, record, extras } = cell;
    const frameClass = classes[`cell__${view.frame}`];
    if (record === null) {
      // A read-only comparison still draws the position — an empty frame in the
      // grid is *the* statement that this visit did not photograph it — but it is
      // not a control there: filing happens on the record page, not inside a
      // viewer.
      if (isCompare) {
        return (
          <div
            key={view.id}
            className={cx(classes.cell, classes.cell__empty, frameClass)}
          >
            <span className={classes.cell_frame}>
              <span className={classes.cell_none}>Not on file</span>
            </span>
            <span className={classes.cell_caption}>
              {getPhotoViewShortLabel(view.id)}
            </span>
          </div>
        );
      }
      return (
        <button
          key={view.id}
          type="button"
          className={cx(classes.cell, classes.cell__slot, frameClass)}
          title={`Add ${getPhotoViewLabelInSentence(view.id)} photograph to ` +
            `${this.visitName()}${this.visitDay()} — files as ` +
            `${getImageTypeLabel(view.imageType).toLowerCase()}`}
          aria-label={`Add the ${getPhotoViewLabelInSentence(view.id)} ` +
            `photograph to ${this.visitName()}`}
          onClick={this.handleFill(view)}
        >
          <span className={classes.cell_frame}>
            <CellPlus />
            {/* On paper the cell is a statement about the visit, not a control:
                nobody can press a plus on a printed chart. Same mechanism as the
                slot row's `.slot_print` and the identity band's `.fact_print`. */}
            <span className={classes.cell_print}>Not on file</span>
          </span>
          <span className={classes.cell_caption}>
            {getPhotoViewShortLabel(view.id)}
          </span>
        </button>
      );
    }
    const date = formatCaptureDate(record.captureDate);
    return (
      <button
        key={view.id}
        type="button"
        className={cx(classes.cell, classes.cell__filled, frameClass, {
          // "Currently open behind this surface" is a fact about the *record
          // page*. Inside the comparison it would read as a selection — a blue
          // ring round one of eighteen cells that means nothing there.
          [classes.cell__active]: record.isActive && !isCompare,
        })}
        // Named for what pressing it does — enlarge, in the read-only viewer.
        // Nothing here offers tracing or analysis: a photograph is not traced by
        // this app, and the caption, the viewer and the record's own chip all say
        // so in the same words.
        title={`${getPhotoViewLabel(view.id)} — ${this.visitName()}` +
          `${date !== null ? ` · ${date}` : ''}. Enlarge (view only, not analysable)`}
        aria-label={`Enlarge the ${getPhotoViewLabelInSentence(view.id)} ` +
          `photograph of ${this.visitName()}`}
        onClick={this.handleOpen(record)}
      >
        <span className={classes.cell_frame}>
          {record.thumbnail !== null ? (
            <img
              className={classes.cell_img}
              src={record.thumbnail}
              alt=""
              draggable={false}
            />
          ) : (
            <span className={classes.cell_none}>No image data</span>
          )}
          {/* A second photograph filed at the same position is not dropped and
              not silently hidden: the cell says how many more there are, and the
              viewer's own position mode lists them. */}
          {extras.length > 0 ? (
            <span
              className={classes.cell_more}
              title={`${extras.length + 1} photographs are filed at this ` +
                'position — this is the earliest of them'}
            >
              +{extras.length}
            </span>
          ) : null}
        </span>
        <span className={classes.cell_caption}>
          {getPhotoViewShortLabel(view.id)}
        </span>
      </button>
    );
  };

  private renderUnplaced = (record: PatientRecord, isCompare: boolean) => {
    const date = formatCaptureDate(record.captureDate);
    return (
      <span key={record.imageId} className={classes.unplaced_item}>
        <button
          type="button"
          className={classes.unplaced_open}
          title={`${getImageTypeLabel(record.type)}` +
            `${date !== null ? ` · ${date}` : ''} — enlarge (view only, not ` +
            'analysable)'}
          onClick={this.handleOpen(record)}
        >
          <span className={classes.unplaced_frame}>
            {record.thumbnail !== null ? (
              <img
                className={classes.cell_img}
                src={record.thumbnail}
                alt=""
                draggable={false}
              />
            ) : null}
          </span>
          <span className={classes.unplaced_name}>
            {getImageTypeLabel(record.type)}
          </span>
        </button>
        {!isCompare && this.props.onEdit !== undefined ? (
          <button
            type="button"
            className={classes.unplaced_fix}
            title={'Record which position of the series this photograph is — it ' +
              'is unplaced in the grid above until then'}
            onClick={this.handleEdit(record)}
          >
            Set position
          </button>
        ) : null}
      </span>
    );
  };

  private handleOpen = (record: PatientRecord) => () =>
    this.props.onOpenPhoto(record);

  private handleFill = (view: PhotoViewOption) => () => {
    if (this.props.onFill !== undefined) {
      this.props.onFill(view);
    }
  };

  private handleEdit = (record: PatientRecord) => () => {
    if (this.props.onEdit !== undefined) {
      this.props.onEdit(record);
    }
  };

  private handleCompareAll = () => {
    if (this.props.onCompare !== undefined) {
      this.props.onCompare(null);
    }
  };
}
