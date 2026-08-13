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
  PhotoSeriesLayout,
  PhotoViewOption,
  TimepointGroup,
} from 'utils/records';

const classes = require('./photoseries.scss');

/** The magnifier on a filled cell's hover label — "this enlarges". */
const ZoomGlyph = () => (
  <svg
    width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"
  >
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="5" cy="5" r="3.4" />
      <path d="M7.6 7.6 L10.6 10.6" />
    </g>
  </svg>
);

/** The `+` inside an empty cell's "Add" label — the mirror of `ZoomGlyph`. */
const AddGlyph = () => (
  <svg
    width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"
  >
    <path
      d="M6 2 V10 M2 6 H10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

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

/** Whether a file drag is currently over the tile (see `onAddBatch`). */
interface DragState {
  isOver: boolean;
}

/**
 * Up to how many filled positions a visit's series is drawn *compactly* — the
 * frames it holds at full size, the rest as a named strip under them (see
 * `renderMissing`).
 *
 * Why there is a threshold at all. The composite's own rule is that the gaps are
 * in the shape of the thing, and it earns that on a nearly complete visit: seven
 * frames on file and two dashed holes *is* the reading "this visit was not
 * photographed from the left". It stops earning it on a progress visit with one
 * photograph, where nine full cells made an 852 × 897px tile that was ~700px of
 * empty dashed frames on screen and, on paper, a whole A4 sheet ~70% "Not on
 * file" boxes for a single photograph. Four is the line: above it the shape still
 * reads, at or below it the visit is sized to what it actually holds and every
 * position is still named, still counted in the head and still fileable.
 */
const SPARSE_MAX_FILLED = 4;

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
  /**
   * Open the photographs filed at *this* position of this visit — the extras
   * badge's own act. The count on a cell is a way in, not a claim: pressing it
   * lands in the enlarged reading with the stack of them under ‹ ›.
   */
  onOpenStack?(view: PhotoViewOption, record: PatientRecord): any;
  /**
   * File a whole batch of photographs into this visit at once — the series is shot
   * in one sitting, and the tile accepts it in one act (see `AddPhotoSeries`).
   * `files` is the drop that landed on the tile, or null for the head's own button.
   */
  onAddBatch?(files: File[] | null): any;
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
 * **…and a sparsely photographed visit is sized to what it holds.** The empty
 * frames earn their space while the composite still reads as a composite; on a
 * progress visit with one photograph on file, nine full cells were ~700px of
 * dashed boxes on screen and most of an A4 sheet on paper. At or below
 * `SPARSE_MAX_FILLED` filled positions the tile draws the frames it has, at the
 * size the composite gives them, in one row (`renderSparse`), and names every
 * position it has not got in one compact strip beneath them (`renderMissing`) —
 * each of which still files exactly itself. Nothing is hidden and nothing is
 * renamed; only the empty frames' *size* changes.
 *
 * **Nothing here is traceable and nothing pretends to be.** A photograph opens in
 * the read-only viewer; no cell offers tracing, an analysis or a measurement, and
 * no landmark is ever plotted on one.
 */
export default class PhotoSeries extends React.PureComponent<PhotoSeriesProps, DragState> {
  state: DragState = { isOver: false };

  render() {
    const { records, canCompare, onAddBatch } = this.props;
    const isCompare = this.props.variant === 'compare';
    const series = buildPhotoSeries(records);
    const visit = this.visitName();
    const positions = series.rows.reduce((n, { cells }) => n + cells.length, 0);
    // A visit with a photograph or two on file is drawn at the size of what it
    // holds, not at the size of the whole series (see `SPARSE_MAX_FILLED`).
    //
    // `total > 0` and not `filled > 0`: a visit holding *no photographs at all*
    // keeps the nine frames, because that reading is the empty composite itself —
    // it is how a series is started (see `AddPhotoSeries`). But a visit whose only
    // photographs carry no position (a legacy record, or a type correction that
    // cleared them) holds photographs, and answering it with nine dashed frames
    // above the strip that lists them is the same ~700px of voids in a different
    // place.
    //
    // Never inside the two-visit comparison: there the two composites are read
    // *against each other*, cell against cell, and a tile that dropped its empty
    // frames would put T3's right buccal beside T1's frontal. A gap costs space
    // there and earns it.
    const isSparse = !isCompare
      && series.total > 0 && series.filled <= SPARSE_MAX_FILLED;
    return (
      <div
        className={cx(classes.series, {
          [classes.series__compare]: isCompare,
          // A drag of the sitting's photographs over the tile it belongs to.
          [classes.series__over]: this.state.isOver,
        })}
        onDragOver={onAddBatch !== undefined ? this.handleDragOver : undefined}
        onDragEnter={onAddBatch !== undefined ? this.handleDragOver : undefined}
        onDragLeave={onAddBatch !== undefined ? this.handleDragLeave : undefined}
        onDrop={onAddBatch !== undefined ? this.handleDrop : undefined}
      >
        {/* What the drop will do, said during the drag. The tile used to ring
            itself blue and tint itself and *say nothing at all* while a sitting's
            nine photographs hovered over it — while the dialog it opens is full of
            exactly the sentence the reader needs. `pointer-events: none` (see the
            stylesheet), so the overlay cannot swallow the drop it describes. */}
        {this.state.isOver ? (
          <div className={classes.series_over} aria-hidden="true">
            <span className={classes.series_over_note}>
              {`Drop to file at ${visit}${this.visitDay()} — positions proposed ` +
                "from each photograph's own shape, editable before anything is " +
                'written'}
            </span>
          </div>
        ) : null}
        {isCompare ? null : (
          <div className={classes.series_head}>
            <span className={classes.series_title}>Photographic series</span>
            <span className={classes.series_count}>
              {series.filled} of {positions} positions
              {/* …and how many photographs those positions hold, wherever the two
                  numbers differ. A re-shoot filed at an occupied position, or a
                  photograph carrying no position at all, made the head read "9 of
                  9 positions" while the visit held ten photographs — with only a
                  cell's `+1` badge saying otherwise. */}
              {series.total !== series.filled ? (
                <span className={classes.series_count_of}>
                  {series.total === 1
                    ? ' · 1 photograph on file'
                    : ` · ${series.total} photographs on file`}
                </span>
              ) : null}
            </span>
            {/* Filing the rest of the sitting: one act for the whole batch, with
                each photograph's frame proposed from its own shape and editable
                before anything is written. A clinic shoots the series in one
                sitting; nine cells were nine full-page uploads. */}
            {onAddBatch !== undefined ? (
              <button
                type="button"
                className={classes.series_add}
                title={`Add several photographs to ${visit} at once — or drop ` +
                  'them anywhere on this tile'}
                onClick={this.handleAddBatch}
              >
                Add photographs
              </button>
            ) : null}
            {/* The comparison this tile is a half of. Offered only where there
                is a second visit with photographs to compare against — a control
                that opens a comparison of one visit with itself is not a
                control. */}
            {canCompare === true && this.props.onCompare !== undefined ? (
              <button
                type="button"
                className={classes.series_compare}
                // Named for the visit it sits on, because it is seeded from it: the
                // comparison opens on a position *this* visit holds and walks that
                // one frame along the whole case. Three tiles carrying an identical
                // "Compare visits" read as three controls doing the same thing.
                title={`Compare ${visit}'s photographs with the other visits' — ` +
                  'one position at a time, along the whole case'}
                onClick={this.handleCompareAll}
              >
                {this.visitToken() !== null
                  ? `Compare ${this.visitToken()} across visits`
                  : 'Compare across visits'}
              </button>
            ) : null}
          </div>
        )}
        {isSparse
          ? this.renderSparse(series, isCompare)
          : series.rows.map(({ row, cells }) => (
            <div key={row.key} className={classes.band}>
              <span className={classes.band_label}>{row.label}</span>
              <div
                className={cx(classes.band_cells, classes[`band_cells__${row.key}`])}
              >
                {cells.map((cell) => this.renderCell(cell, isCompare))}
              </div>
            </div>
          ))}
        {/* …and, on a sparsely photographed visit, every position it has not got —
            named, counted and (on the record page) still the control that files
            it, at the size of a line of text instead of ~700px of empty frames. */}
        {isSparse ? this.renderMissing(series, isCompare) : null}
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

  /** This visit's series token ("T2"), where it carries one. */
  private visitToken = (): string | null =>
    getTimepointToken(this.props.group.label);

  /** How this visit is named in a sentence — its series token, or a phrase. */
  private visitName = (): string => {
    const token = this.visitToken();
    return token !== null ? token : 'this visit';
  };

  /** The day an upload filed here will be stamped with, where the visit has one. */
  private visitDay = (): string => {
    const { group } = this.props;
    return group.firstDate !== null ? ` · ${group.firstDate}` : '';
  };

  /**
   * A sparsely photographed visit: the frames it actually holds, in the series'
   * own reading order, on the extraoral band's own four-column grid — and nothing
   * else (the positions it has not got are named in `renderMissing` below).
   *
   * **Why one row and not the three bands.** The bands are the composite, and the
   * composite is a *reading*: facial symmetry against the profile, the buccal
   * segments against each other, the arches beneath them. Four photographs cannot
   * be read that way, and keeping the three bands for them cost the full height of
   * all three — a 4-of-9 visit came out 938px tall, i.e. *taller than the 9-of-9
   * visit above it*, because a band's row is as tall as its tallest cell whether it
   * holds one frame or four. One row of the same four columns keeps every frame at
   * exactly the size the composite gives it (199px wide at 1440, 294px at 1920) and
   * costs one row's height for the whole visit.
   *
   * Nothing is renamed and nothing is hidden: each cell carries its own position's
   * caption, the head states the count out of nine, and the strip below names every
   * position that is not here.
   */
  private renderSparse = (
    series: PhotoSeriesLayout<PatientRecord>, isCompare: boolean,
  ) => {
    const filled: Array<PhotoSeriesCell<PatientRecord>> = [];
    series.rows.forEach(({ cells }) => cells.forEach((cell) => {
      if (cell.record !== null) {
        filled.push(cell);
      }
    }));
    if (filled.length === 0) {
      // A visit whose photographs all carry no position: there is nothing to draw
      // here, and a band label over an empty grid would be a heading for nothing.
      // The strip below names all nine, and the unplaced strip carries the
      // photographs themselves.
      return null;
    }
    return (
      <div className={classes.band}>
        <span className={classes.band_label}>On file</span>
        <div className={cx(classes.band_cells, classes.band_cells__sparse)}>
          {filled.map((cell) => this.renderCell(cell, isCompare))}
        </div>
      </div>
    );
  };

  /**
   * The named positions this visit has not got, as one compact strip under the
   * frames it has — the sparse tile's answer to "nine cells however few are
   * filled" (see `SPARSE_MAX_FILLED`).
   *
   * Every position is still named, in the composite's own reading order, and on
   * the record page every one of them is still the control that files exactly
   * itself — the same act the empty cell carries, at the size of a line of text.
   * On paper the strip is the same sentence with the pluses dropped, which is what
   * keeps a one-photograph visit to a block instead of a sheet.
   */
  private renderMissing = (
    series: PhotoSeriesLayout<PatientRecord>, isCompare: boolean,
  ) => {
    const empty: Array<PhotoSeriesCell<PatientRecord>> = [];
    series.rows.forEach(({ cells }) => cells.forEach((cell) => {
      if (cell.record === null) {
        empty.push(cell);
      }
    }));
    if (empty.length === 0) {
      return null;
    }
    const canFill = !isCompare && this.props.onFill !== undefined;
    const token = this.visitToken();
    return (
      <div className={classes.missing}>
        <span className={classes.missing_label}>
          {empty.length === 1
            ? '1 position not on file'
            : `${empty.length} positions not on file`}
          {/* The visit, on screen, where the reader may be scanning three tiles;
              never on paper, where this strip prints inside the visit's own block
              under the stamp that has just named it (the rule `.slots_at_print`
              follows two rows below it). */}
          <span className={classes.missing_at}>
            {token !== null ? ` at ${token}${this.visitDay()}` : ''}
          </span>
        </span>
        <span className={classes.missing_list}>
          {empty.map(({ view }) => (
            canFill ? (
              <button
                key={view.id}
                type="button"
                className={classes.missing_item}
                title={`Add ${getPhotoViewLabelInSentence(view.id)} photograph to ` +
                  `${this.visitName()}${this.visitDay()} — files as ` +
                  `${getImageTypeLabel(view.imageType).toLowerCase()}`}
                aria-label={`Add the ${getPhotoViewLabelInSentence(view.id)} ` +
                  `photograph to ${this.visitName()}`}
                onClick={this.handleFill(view)}
              >
                <span className={classes.missing_plus} aria-hidden="true">+</span>
                {getPhotoViewShortLabel(view.id)}
              </button>
            ) : (
              <span key={view.id} className={classes.missing_item}>
                {getPhotoViewShortLabel(view.id)}
              </span>
            )
          ))}
        </span>
      </div>
    );
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
            {/* The word for the act, revealed on the frame it acts on — the mirror
                of a filled cell's "Enlarge". A blue tint and a bare plus left the
                sentence ("Add the upper occlusal photograph to T2 · 2026-06-18")
                living only in the `title`, i.e. only for a mouse that waited. */}
            <span className={classes.cell_add}>
              <AddGlyph />
              Add
            </span>
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
      <div
        key={view.id}
        className={cx(classes.cell, classes.cell__filled, frameClass, {
          // "Currently open behind this surface" is a fact about the *record
          // page*. Inside the comparison it would read as a selection — a blue
          // ring round one of eighteen cells that means nothing there.
          [classes.cell__active]: record.isActive && !isCompare,
        })}
      >
        <button
          type="button"
          className={classes.cell_open}
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
            {/* What the press does, on the frame it does it to — nine cells that
                open a viewer used to give no sign at all that a photograph
                enlarges. Screen only: nobody enlarges a printed photograph. */}
            <span className={classes.cell_zoom}>
              <ZoomGlyph />
              Enlarge
            </span>
          </span>
          <span className={classes.cell_caption}>
            {getPhotoViewShortLabel(view.id)}
          </span>
        </button>
        {/* A second photograph filed at the same position is not dropped, not
            hidden and not merely counted: the badge is the control that opens the
            stack of them, which is what makes `PhotoSeriesCell#extras`' promise
            ("they are all reachable") true from this surface. */}
        {extras.length > 0 ? (
          <button
            type="button"
            className={classes.cell_more}
            title={`${extras.length + 1} photographs are filed at ` +
              `${getPhotoViewLabelInSentence(view.id)} — open all of them ` +
              '(this cell shows the earliest)'}
            aria-label={`Open all ${extras.length + 1} photographs filed at ` +
              `${getPhotoViewLabelInSentence(view.id)} of ${this.visitName()}`}
            onClick={this.handleOpenStack(view, record)}
          >
            +{extras.length}
          </button>
        ) : null}
      </div>
    );
  };

  private renderUnplaced = (record: PatientRecord, isCompare: boolean) => {
    const date = formatCaptureDate(record.captureDate);
    // The strip exists precisely because *nothing knows* which of the five
    // intraoral frames this photograph is: the clinician has to look at it and
    // say. At 54 × 36px they could not — they had to enlarge it first, which made
    // "Set position" a control that could not be answered from what was on screen.
    // So the frame is the size a shape can be told at, in the photograph's own
    // aspect where the record holds its pixels.
    const aspect = record.width !== null && record.height !== null
      && record.width > 0 && record.height > 0
      ? record.width / record.height
      : 1.5;
    const frameStyle: React.CSSProperties = {
      width: Math.round(Math.max(60, Math.min(150, 80 * aspect))),
    };
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
          <span className={classes.unplaced_frame} style={frameStyle}>
            {record.thumbnail !== null ? (
              <img
                className={classes.cell_img}
                src={record.thumbnail}
                alt=""
                draggable={false}
              />
            ) : null}
          </span>
          <span className={classes.unplaced_main}>
            <span className={classes.unplaced_name}>
              {getImageTypeLabel(record.type)}
            </span>
            {/* …and the day it was taken, on screen: which of two unplaced
                intraoral photographs this is, is a question about the sitting as
                much as about the shape, and the answer was in a tooltip. */}
            <span className={classes.unplaced_meta}>
              {date !== null ? date : 'No capture date'}
              {record.width !== null && record.height !== null
                ? ` · ${record.width} × ${record.height}` : ''}
            </span>
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

  private handleOpenStack = (view: PhotoViewOption, record: PatientRecord) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (this.props.onOpenStack !== undefined) {
        this.props.onOpenStack(view, record);
      } else {
        // Never a dead control: without the stack reading the badge still opens
        // the photograph it is drawn on.
        this.props.onOpenPhoto(record);
      }
    };

  private handleAddBatch = () => {
    if (this.props.onAddBatch !== undefined) {
      this.props.onAddBatch(null);
    }
  };

  // ---- A drop of the whole sitting onto the tile -----------------------------

  private handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!this.state.isOver) {
      this.setState({ isOver: true });
    }
  };

  private handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    this.setState({ isOver: false });
  };

  private handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState({ isOver: false });
    const files: File[] = [];
    for (let i = 0; i < e.dataTransfer.files.length; i += 1) {
      files.push(e.dataTransfer.files[i]);
    }
    if (this.props.onAddBatch !== undefined && files.length > 0) {
      this.props.onAddBatch(files);
    }
  };
}
