import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import IconOpen from 'material-ui/svg-icons/action/visibility';
import IconEdit from 'material-ui/svg-icons/image/edit';
import IconDelete from 'material-ui/svg-icons/action/delete';

import { PatientRecord } from 'store/reducers/workspace';

import PhotoSeries from './PhotoSeries';

import {
  buildPhotoSeries,
  findPhotoView,
  formatCaptureDate,
  formatInterval,
  getImageTypeLabel,
  getPhotoViewLabel,
  getPhotoViewLabelInSentence,
  getPhotoViewShortLabel,
  getTimepointToken,
  getVisitPill,
  isPhotographType,
  parseCaptureDate,
  reconcilePhotoView,
  PHOTO_SERIES_ROWS,
  TimepointGroup,
} from 'utils/records';

const classes = require('./photoviewer.scss');

const actionIconStyle: React.CSSProperties = { width: 16, height: 16 };

/**
 * Which reading of the record's photographs is on screen.
 *
 * `single` — one photograph, at a size it can be assessed at.
 * `position` — one position across every visit that photographed it.
 * `series` — two visits' whole series, side by side.
 */
export type PhotoViewerMode = 'single' | 'position' | 'series';

/**
 * Which sequence the enlarged reading's ‹ › walks.
 *
 * A photograph is never read on its own: a clinician walks a visit's series frame
 * by frame, or one frame along the case, or the several photographs filed at one
 * position. So the enlarged reading carries the walk the reader arrived by, and
 * says which one it is — "3 of 9 · T1 series" cannot be read as a position count.
 *
 * `visit` — the whole series of the visit the photograph belongs to, in the
 * composite's own reading order (extras and unplaced photographs included, so
 * nothing of the visit is unreachable).
 * `position` — this position at every visit that photographed it: the comparison
 * the strip is, continued inside the enlargement.
 * `stack` — the photographs filed at *one* position of *one* visit, which is what
 * a cell's `+N` badge and the strip's own "+N more" line open.
 */
export type PhotoSeqScope = 'visit' | 'position' | 'stack';

/** What the viewer was opened on. */
export interface PhotoViewerTarget {
  mode: PhotoViewerMode;
  /** The photograph pressed, where one was. */
  imageId: string | null;
  /** The position it belongs to (or the position a comparison was asked for). */
  view: PhotoView | null;
  /** The visit it was opened from — seeds the two-visit comparison. */
  groupKey: string | null;
  /**
   * Which sequence an enlarged reading walks (see `PhotoSeqScope`). Omitted, a
   * photograph opened from a visit's own tile walks that visit's series.
   */
  scope?: PhotoSeqScope;
}

export interface PhotoViewerProps {
  open: boolean;
  target: PhotoViewerTarget | null;
  /** Every visit of the record, in the timeline's own chronological order. */
  groups: Array<TimepointGroup<PatientRecord>>;
  /**
   * The patient's age on a given capture day, or null — the records dashboard's
   * own derivation, handed over rather than repeated, so a caption here and a
   * visit stamp on the page behind it cannot state two ages for one day.
   */
  getAgeOn(isoDate: string | null): string | null;
  onClose(): any;
  /** Open this photograph in the app's read-only record viewer. */
  onOpenRecord(record: PatientRecord): any;
  /** Correct this photograph's record details (type, position, visit, day). */
  onEdit(record: PatientRecord): any;
  /** Drop this photograph from the record. */
  onRemove(record: PatientRecord): any;
}

interface State {
  mode: PhotoViewerMode;
  /** The photograph on screen in `single` mode. */
  imageId: string | null;
  /** The position on screen in `position` mode. */
  view: PhotoView | null;
  /** Which sequence `single` mode's ‹ › walks (see `PhotoSeqScope`). */
  scope: PhotoSeqScope;
  /** The two visits compared in `series` mode, by group key. */
  aKey: string | null;
  bKey: string | null;
  /**
   * Whether the last pick in `series` mode swapped the pair — the reader chose the
   * visit that was already on the other side, and the two sides traded places
   * rather than both showing one visit. Stated on screen, because a select that
   * rearranged both columns without saying so would be a control doing something
   * it did not announce.
   */
  swapped: boolean;
  /**
   * Whether the across-visits chronology has unread columns behind / ahead of what
   * is on screen — measured from the track itself (see `measureStrip`), not guessed
   * from the number of visits, because whether six columns overflow depends on the
   * window, the position's own frame and the platform's scrollbar.
   *
   * They are what the edge veil and the ‹ › the track carries are drawn from: a
   * column cut by the dialog edge with nothing over it read as a *cropped
   * photograph*, and the CSS-only affordance this replaces was painted behind the
   * columns, where an opaque photograph hid it completely.
   */
  canScrollBack: boolean;
  canScrollOn: boolean;
}

/** How a visit is named in this viewer's captions: its pill, then its day. */
const visitLabel = (group: TimepointGroup<PatientRecord>): string => {
  const token = getTimepointToken(group.label);
  return token !== null ? token : getVisitPill(group.label).token;
};

/** Every visit that holds at least one photograph. */
const photoVisits = (
  groups: Array<TimepointGroup<PatientRecord>>,
): Array<TimepointGroup<PatientRecord>> =>
  groups.filter(
    (group) => group.records.some(({ type }) => isPhotographType(type)),
  );

/**
 * Every visit the across-visits chronology draws a column for: each labelled visit
 * of the case, plus any unlabelled group that holds photographs (so no photograph
 * of the record is unreachable from here).
 *
 * **Why not only the photographed visits.** `renderPosition` already argues that a
 * visit which does not hold *this* position gets an empty column, because hiding it
 * would silently compress the chronology. A visit that holds no photographs at all
 * is the same fact one step further: a case photographed at T1 and T3 with a
 * ceph-only T2 read "T1 … T3 +2 y" with T2 nowhere on screen, i.e. the interval
 * spanned a visit the reader was never told about. The principle cannot be applied
 * one way for a visit with one photograph and the other way for a visit with none.
 */
const chronologyVisits = (
  groups: Array<TimepointGroup<PatientRecord>>,
): Array<TimepointGroup<PatientRecord>> =>
  groups.filter(
    (group) => group.label !== null
      || group.records.some(({ type }) => isPhotographType(type)),
  );

/**
 * The record's photographs, read the three ways a clinician reads them.
 *
 * **Why one position across all visits is the default comparison.** Two whole
 * series side by side is the layout a *records sheet* uses, and it is offered here
 * too — but it is not what a clinician does when they ask whether treatment is
 * working. They pick one frame and walk it along the case: the smile at T1, T2 and
 * T3; the right buccal segment at every visit as the molars come into class I; the
 * upper occlusal as the arch is expanded. Change is only legible when the framing
 * is held constant and time is the only variable, which is exactly what a
 * position-across-visits row is and exactly what two side-by-side composites are
 * not — in a nine-cell-versus-nine-cell composite the eye has to hop between two
 * grids to hold one frame in mind. So `position` is the mode "Compare visits"
 * opens on, with the whole-series pair one press away for the reader who wants the
 * records-sheet reading.
 *
 * Nothing in here traces, measures or analyses: every mode is a way of looking at
 * photographs, and each states that the photograph is not analysable in the same
 * words the record's own card uses.
 */
export default class PhotoViewer extends React.PureComponent<PhotoViewerProps, State> {
  state: State = this.seed(this.props);

  /** The across-visits track, for measuring what is still off screen. */
  private strip: HTMLDivElement | null = null;

  componentDidMount() {
    window.addEventListener('resize', this.measureStrip);
    this.measureStrip();
  }

  componentWillReceiveProps(next: PhotoViewerProps) {
    // Re-opening starts from what was actually pressed, never from the previous
    // reading — the same rule the record dialogs of this surface follow.
    if (next.open && !this.props.open) {
      this.setState(this.seed(next));
    }
  }

  componentDidUpdate() {
    // A different position, a different reading or a re-opened dialog changes what
    // the track holds and how wide its columns are, so what is off screen is
    // re-measured rather than remembered.
    this.measureStrip();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.measureStrip);
  }

  render() {
    const { open, onClose } = this.props;
    const record = this.currentRecord();
    const { mode } = this.state;
    const visits = photoVisits(this.props.groups);
    const title = mode === 'single'
      ? (record !== undefined
        ? getPhotoViewLabel(reconcilePhotoView(record.type, record.photoView))
        : 'Photograph')
      : mode === 'position'
        // …and where the record places no photograph at all, the title names what
        // is on screen rather than reading the empty state as a position: with
        // nothing placed, `getPhotoViewLabel(null)` is "Position not recorded",
        // and the heading said "Position not recorded across visits".
        ? (this.state.view !== null
          ? `${getPhotoViewLabel(this.state.view)} across visits`
          : 'Photographs across visits')
        : 'Two visits, whole series';
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onClose}
        // Screen-only chrome, like every other dialog of this surface: printing
        // the case sheet with the viewer open put a grey wash over the whole
        // sheet and the dialog on top of the films.
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <div className={classes.title_main}>
              <h3 className={classes.title_heading}>{title}</h3>
              <span className={classes.title_caption}>
                {mode === 'single' && record !== undefined
                  ? this.recordCaption(record)
                  : 'Photographs are kept with the record and shown here — ' +
                    'they are not traced or analysed'}
              </span>
            </div>
            {this.renderModes(visits)}
          </div>
        }
        actions={[
          <FlatButton
            key="close"
            label="Close"
            labelStyle={{ textTransform: 'none' }}
            onClick={onClose}
          />,
        ]}
        autoScrollBodyContent
        contentStyle={{ width: '96%', maxWidth: 1180 }}
        bodyStyle={{ padding: '12px 24px 16px', borderTop: '1px solid #DDE3EA' }}
        actionsContainerStyle={{ padding: '8px 24px', borderTop: '1px solid #DDE3EA' }}
        titleStyle={{ padding: '18px 24px 12px' }}
        paperProps={{
          style: {
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(16, 30, 50, .22)',
          },
        }}
      >
        {mode === 'single' ? this.renderSingle() : null}
        {mode === 'position' ? this.renderPosition(visits) : null}
        {mode === 'series' ? this.renderSeries(visits) : null}
      </Dialog>
    );
  }

  // ---- The three readings ---------------------------------------------------

  /**
   * One photograph, as large as the window allows — and the walk it belongs to.
   *
   * The frame's *width* follows the photograph's own aspect (its recorded pixel
   * size, or the position's frame where the pixels are unknown), so a portrait
   * photograph is not laid inside an 830px-wide panel with 210px of dark ground
   * either side of it. Its height is bounded by the window rather than by a fixed
   * `64vh`, so on a 1366 × 768 laptop the reading shrinks instead of being clipped.
   */
  private renderSingle = () => {
    const record = this.currentRecord();
    if (record === undefined) {
      return (
        <p className={classes.empty}>
          This photograph is no longer on file.
        </p>
      );
    }
    const group = this.groupOf(record);
    const view = reconcilePhotoView(record.type, record.photoView);
    const date = formatCaptureDate(record.captureDate);
    const age = this.props.getAgeOn(record.captureDate);
    const option = findPhotoView(view);
    const aspect = record.width !== null && record.height !== null
      && record.width > 0 && record.height > 0
      ? record.width / record.height
      : (option !== undefined && option.frame === 'landscape' ? 1.5 : 0.75);
    const frameStyle = {
      // Bounded by **both** budgets the reading has, which is the whole of the
      // fix here: the window's height (`--photo-h`, 18px of it the frame's own
      // padding and hairline) *and* the width the facts column needs beside the
      // photograph (`--facts-col` out of the dialog body's own `--single-w`).
      //
      // Height alone was not enough. A landscape frame — every intraoral and
      // occlusal photograph — grew wider than the body as the window got taller
      // (854px of an 1132px body at a 1000px-tall window), so the facts and the
      // three record actions wrapped *below* the photograph and off the bottom of
      // the dialog: 296px of a scrollable body with no scroll hint, and "Open in
      // record viewer", "Edit details" and "Remove" unreachable. Now the
      // photograph shrinks instead, and the facts never leave its side.
      //
      // `max(240px, …)` so a genuinely narrow window still gets a readable
      // photograph and wraps honestly rather than being squeezed to nothing.
      maxWidth: `max(240px, min(${aspect.toFixed(3)} * (var(--photo-h) - 18px) `
        + '+ 18px, var(--single-w) - var(--facts-col)))',
    } as React.CSSProperties;
    return (
      <div className={classes.single}>
        <div className={classes.single_main}>
          <div className={classes.single_frame} style={frameStyle}>
            {record.thumbnail !== null ? (
              <img
                className={classes.single_img}
                src={record.thumbnail}
                alt={`${getPhotoViewLabel(view)} photograph`}
                draggable={false}
              />
            ) : (
              <span className={classes.single_none}>Image data unavailable</span>
            )}
          </div>
          {this.renderSeq()}
        </div>
        <div className={classes.facts}>
          <FactRow label="Position" value={getPhotoViewLabel(view)} />
          <FactRow label="Type" value={getImageTypeLabel(record.type)} />
          <FactRow
            label="Visit"
            value={group !== undefined && group.label !== null
              ? group.label : null}
            fallback="No timepoint"
          />
          <FactRow label="Captured" value={date} fallback="No capture date" isNum />
          <FactRow
            label="Age then"
            value={age}
            fallback={date === null
              ? 'Needs a capture date' : 'Needs the date of birth'}
            isNum
          />
          <FactRow
            label="Pixels"
            value={record.width !== null && record.height !== null
              ? `${record.width} × ${record.height}` : null}
            fallback="Unknown"
            isNum
          />
          <FactRow label="File" value={record.name} fallback="Unnamed" />
          <p className={classes.facts_note}>
            View only — photographs are kept with the record and are not traced or
            analysed here.
          </p>
          <div className={classes.facts_actions}>
            <button
              type="button"
              className={classes.action}
              title="Open this photograph in the record viewer, where it can be zoomed"
              onClick={this.handleOpenRecord(record)}
            >
              <IconOpen color="#1565C0" style={actionIconStyle} />
              Open in record viewer
            </button>
            <button
              type="button"
              className={classes.action}
              title="Correct this photograph’s position, visit, day or type"
              onClick={this.handleEdit(record)}
            >
              <IconEdit color="#1565C0" style={actionIconStyle} />
              Edit details
            </button>
            <button
              type="button"
              className={cx(classes.action, classes.action__danger)}
              title="Remove this photograph from the patient’s record"
              onClick={this.handleRemove(record)}
            >
              <IconDelete color="#C62828" style={actionIconStyle} />
              Remove
            </button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * ‹ › within the reading the enlargement was arrived by (see `PhotoSeqScope`),
   * with the sequence named: a clinician walking a visit's series or one frame
   * along the case had to close back to a grid between every two photographs.
   *
   * Drawn only where there is somewhere to step; the arrows at either end stay
   * focusable and keep their tooltip rather than becoming dead controls, which is
   * the rule the reading switch's own unavailable chips follow.
   */
  private renderSeq = () => {
    const seq = this.sequence();
    if (seq.ids.length < 2) {
      return null;
    }
    const index = seq.ids.indexOf(this.state.imageId as string);
    if (index < 0) {
      return null;
    }
    const hasPrev = index > 0;
    const hasNext = index < seq.ids.length - 1;
    return (
      <div className={classes.seq} role="group" aria-label={seq.label}>
        <button
          type="button"
          className={cx(classes.seq_step, {
            [classes.seq_step__off]: !hasPrev,
          })}
          aria-label={`Previous — ${seq.label}`}
          aria-disabled={!hasPrev}
          title={hasPrev
            ? `Previous of ${seq.label}`
            : `This is the first of ${seq.label}`}
          onClick={hasPrev ? this.handleStep(-1) : undefined}
        >
          ‹
        </button>
        <span className={classes.seq_count}>
          {index + 1}
          <span className={classes.seq_of}>{` of ${seq.ids.length} · `}</span>
          {seq.label}
        </span>
        <button
          type="button"
          className={cx(classes.seq_step, {
            [classes.seq_step__off]: !hasNext,
          })}
          aria-label={`Next — ${seq.label}`}
          aria-disabled={!hasNext}
          title={hasNext
            ? `Next of ${seq.label}`
            : `This is the last of ${seq.label}`}
          onClick={hasNext ? this.handleStep(1) : undefined}
        >
          ›
        </button>
      </div>
    );
  };

  /**
   * One position, at every visit that photographed it — the comparison a
   * clinician actually reads (see this class's own doc comment).
   *
   * Every visit with photographs gets a column, including the ones that do *not*
   * hold this position: an empty column is the honest statement that the frame was
   * not taken then, and hiding it would silently compress the chronology.
   */
  private renderPosition = (photographed: Array<TimepointGroup<PatientRecord>>) => {
    const { view } = this.state;
    const held = this.countsByView(photographed);
    // Every labelled visit of the case, not only the photographed ones — see
    // `chronologyVisits`.
    const visits = chronologyVisits(this.props.groups);
    const option = findPhotoView(view);
    const frameClass = option !== undefined
      ? classes[`strip_col__${option.frame}`]
      : classes.strip_col__portrait;
    return (
      <div className={classes.across}>
        <div className={classes.picker} role="group" aria-label="Series position">
          {PHOTO_SERIES_ROWS.map((row) => (
            <span key={row.key} className={classes.picker_band}>
              <span className={classes.picker_label}>{row.label}</span>
              {row.views.map((id) => {
                const count = held[id] !== undefined ? held[id] : 0;
                return (
                  <button
                    key={id}
                    type="button"
                    className={cx(classes.picker_chip, {
                      [classes.picker_chip__on]: id === view,
                      [classes.picker_chip__off]: count === 0,
                    })}
                    aria-pressed={id === view}
                    aria-disabled={count === 0}
                    title={count === 0
                      ? `No visit has the ${getPhotoViewLabel(id).toLowerCase()} ` +
                        'photograph on file'
                      : `${getPhotoViewLabel(id)} — on file at ` +
                        `${count === 1 ? '1 visit' : `${count} visits`}`}
                    onClick={count === 0 ? undefined : this.handlePickView(id)}
                  >
                    {getPhotoViewShortLabel(id)}
                    {count > 0 ? (
                      <span className={classes.picker_count}>{count}</span>
                    ) : null}
                  </button>
                );
              })}
            </span>
          ))}
        </div>
        {visits.length === 0 ? (
          <p className={classes.empty}>
            No visit of this record holds a photograph yet.
          </p>
        ) : (
          <div className={classes.track}>
          <div
            className={cx(classes.strip, {
              // Two columns have the dialog to themselves and are read larger.
              [classes.strip__roomy]: visits.length <= 2,
            })}
            ref={this.setStrip}
            onScroll={this.measureStrip}
          >
            {visits.map((group, index) => {
              const cell = view !== null
                ? this.cellAt(group, view) : null;
              const record = cell !== null ? cell.record : null;
              // A visit that holds no photographs at all says so in its own words:
              // "not on file" is about this *position*, and on a ceph-only visit it
              // would read as a gap in a series that was never started.
              const hasPhotos = group.records.some(
                ({ type }) => isPhotographType(type),
              );
              const since = index > 0
                ? formatInterval(
                  parseCaptureDate(visits[index - 1].firstDate),
                  parseCaptureDate(group.firstDate),
                )
                : null;
              return (
                <div key={group.key} className={cx(classes.strip_col, frameClass)}>
                  <div className={classes.strip_head}>
                    <span className={classes.strip_visit}>{visitLabel(group)}</span>
                    {/* Elapsed time from the previous column, so a row of four
                        photographs is a chronology and not four pictures. */}
                    {since !== null ? (
                      <span className={classes.strip_since}>+{since}</span>
                    ) : null}
                  </div>
                  {record !== null ? (
                    <button
                      type="button"
                      className={classes.strip_frame}
                      title={`Enlarge — ${getPhotoViewLabel(view)} at ` +
                        `${visitLabel(group)}`}
                      onClick={this.handleEnlarge(record)}
                    >
                      {record.thumbnail !== null ? (
                        <img
                          className={classes.strip_img}
                          src={record.thumbnail}
                          alt=""
                          draggable={false}
                        />
                      ) : null}
                    </button>
                  ) : (
                    <div
                      className={cx(classes.strip_frame, classes.strip_frame__empty)}
                    >
                      <span className={classes.strip_none}>
                        {hasPhotos
                          ? 'Not on file'
                          : 'Not photographed at this visit'}
                      </span>
                    </div>
                  )}
                  <div className={classes.strip_foot}>
                    <span className={classes.strip_date}>
                      {group.firstDate !== null
                        ? group.firstDate : 'No capture date'}
                    </span>
                    {this.props.getAgeOn(group.firstDate) !== null ? (
                      <span className={classes.strip_age}>
                        {this.props.getAgeOn(group.firstDate)}
                      </span>
                    ) : null}
                  </div>
                  {/* …and the several photographs filed at one position are a
                      control, not a count: it opens the stack of them in the
                      enlarged reading, where ‹ › steps through every one. */}
                  {cell !== null && record !== null && cell.extras.length > 0 ? (
                    <button
                      type="button"
                      className={classes.strip_more}
                      title={`${cell.extras.length + 1} photographs are filed at ` +
                        `${getPhotoViewLabelInSentence(view)} of ` +
                        `${visitLabel(group)} — open all of them`}
                      onClick={this.handleOpenStack(record)}
                    >
                      {`+${cell.extras.length} more here — open all`}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {/* What is still off screen, said twice over: a veil that covers the
              column the dialog edge cuts — so a clipped photograph can never be
              read as a cropped one — and a control that brings it in. Drawn only
              on the side that actually has unread visits, and drawn *over* the
              columns, which is what a background gradient behind an opaque
              photograph could not do. */}
          {this.renderEdge('back', visits.length)}
          {this.renderEdge('on', visits.length)}
          </div>
        )}
      </div>
    );
  };

  /**
   * One edge of the across-visits track: the veil over the cut column and the
   * arrow that scrolls it into view.
   *
   * `back` is earlier visits, `on` is later ones — the chronology's own direction,
   * named that way in the tooltip rather than "left"/"right", which is a fact about
   * a scrollbar and not about the case.
   */
  private renderEdge = (side: 'back' | 'on', count: number) => {
    const isBack = side === 'back';
    if (isBack ? !this.state.canScrollBack : !this.state.canScrollOn) {
      return null;
    }
    const what = isBack ? 'Earlier visits' : 'Later visits';
    return (
      <span
        key={side}
        className={cx(classes.edge, isBack ? classes.edge__back : classes.edge__on)}
      >
        <button
          type="button"
          className={classes.edge_step}
          title={`${what} — ${count} visits in all, and the row is wider than the ` +
            'window: this brings the next ones in'}
          aria-label={`${what} of this position`}
          onClick={this.handleScrollStrip(isBack ? -1 : 1)}
        >
          {isBack ? '‹' : '›'}
        </button>
      </span>
    );
  };

  /**
   * Two visits' whole series, side by side — the records-sheet reading.
   *
   * **The two sides are a from/to pair and can never be one visit.** Both selects
   * list every photographed visit, and choosing the one that is already on the
   * other side *swaps* the pair rather than putting one visit in both columns: the
   * header read "0 days apart" above two identical nine-cell composites, which is a
   * comparison of nothing — and the tile's own "Compare visits" already refuses to
   * offer a comparison of one visit with itself for exactly that reason.
   */
  private renderSeries = (visits: Array<TimepointGroup<PatientRecord>>) => {
    const a = this.groupByKey(this.state.aKey);
    const b = this.groupByKey(this.state.bKey);
    const isPair = a !== undefined && b !== undefined && a.key !== b.key;
    const interval = isPair
      ? formatInterval(
        parseCaptureDate((a as TimepointGroup<PatientRecord>).firstDate),
        parseCaptureDate((b as TimepointGroup<PatientRecord>).firstDate),
      )
      : null;
    return (
      <div className={classes.pair}>
        {/* Which two visits, in which direction, and how far apart — and where the
            two are recorded on one day it says *that* rather than "0 days apart",
            which is a duration nobody wrote down. */}
        {isPair ? (
          <p className={classes.pair_interval}>
            {`${visitLabel(a as TimepointGroup<PatientRecord>)} → ` +
              `${visitLabel(b as TimepointGroup<PatientRecord>)}`}
            {interval === null
              ? ' · interval unknown'
              : (interval === '0 days'
                ? ' · both recorded on the same day'
                : ` · ${interval} apart`)}
          </p>
        ) : null}
        {this.state.swapped ? (
          <p className={classes.pair_swapped}>
            That visit was already on the other side, so the two sides swapped.
          </p>
        ) : null}
        <div className={classes.pair_cols}>
          {[
            { group: a, key: 'a', onChange: this.handlePickA },
            { group: b, key: 'b', onChange: this.handlePickB },
          ].map(({ group, key, onChange }) => (
            <div key={key} className={classes.pair_col}>
              <div className={classes.pair_head}>
                <select
                  className={classes.pair_select}
                  value={group !== undefined ? group.key : ''}
                  aria-label={key === 'a'
                    ? 'Visit in the left column' : 'Visit in the right column'}
                  title={key === 'a'
                    ? 'Which visit the left composite is — picking the visit ' +
                      'already on the right swaps the two'
                    : 'Which visit the right composite is — picking the visit ' +
                      'already on the left swaps the two'}
                  onChange={onChange}
                >
                  {visits.map((visit) => (
                    <option key={visit.key} value={visit.key}>
                      {visitLabel(visit)}
                      {visit.firstDate !== null ? ` · ${visit.firstDate}` : ''}
                    </option>
                  ))}
                </select>
                {group !== undefined
                  && this.props.getAgeOn(group.firstDate) !== null ? (
                    <span className={classes.pair_age}>
                      Age {this.props.getAgeOn(group.firstDate)}
                    </span>
                  ) : null}
              </div>
              {group !== undefined ? (
                <PhotoSeries
                  group={group}
                  records={group.records}
                  variant="compare"
                  onOpenPhoto={this.handleShowSingle}
                />
              ) : (
                <p className={classes.empty}>No visit selected.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** The reading switch — three ways of looking, named for what they show. */
  private renderModes = (visits: Array<TimepointGroup<PatientRecord>>) => {
    const record = this.currentRecord();
    const modes: Array<{
      id: PhotoViewerMode; label: string; isEnabled: boolean; title: string;
    }> = [
      {
        id: 'single',
        label: 'One photograph',
        isEnabled: record !== undefined,
        title: record !== undefined
          ? 'The photograph on its own, as large as the window allows'
          : 'Press a photograph in either comparison to enlarge it',
      },
      {
        id: 'position',
        label: 'Across visits',
        isEnabled: visits.length > 0,
        title: 'One position of the series at every visit that photographed it — ' +
          'the same framing, so time is the only variable',
      },
      {
        id: 'series',
        label: 'Two visits',
        isEnabled: visits.length > 1,
        title: visits.length > 1
          ? 'Two visits’ whole photographic series, side by side'
          : 'Only one visit of this record holds photographs',
      },
    ];
    return (
      <div className={classes.modes} role="group" aria-label="Reading">
        {modes.map(({ id, label, isEnabled, title }) => (
          <button
            key={id}
            type="button"
            className={cx(classes.mode, {
              [classes.mode__on]: this.state.mode === id,
              [classes.mode__off]: !isEnabled,
            })}
            aria-pressed={this.state.mode === id}
            aria-disabled={!isEnabled}
            title={title}
            onClick={isEnabled ? this.handleMode(id) : undefined}
          >
            {label}
          </button>
        ))}
      </div>
    );
  };

  // ---- Reading the record ---------------------------------------------------

  /** What the viewer opens on, given what was pressed. */
  private seed(props: PhotoViewerProps): State {
    const { target, groups } = props;
    const visits = photoVisits(groups);
    const record = target !== null && target.imageId !== null
      ? this.findRecord(props, target.imageId) : undefined;
    // The position: the one asked for, else the pressed photograph's own, else
    // the first position any visit of this record actually holds — never a
    // position nothing is filed at, which would open the comparison on nine
    // empty frames.
    const held = this.countsByView(visits);
    const firstHeld = PHOTO_SERIES_ROWS
      .reduce((all: PhotoView[], row) => all.concat(row.views), [])
      .filter((id) => held[id] !== undefined && held[id] > 0)[0];
    const view = target !== null && target.view !== null
      ? target.view
      : (record !== undefined
        ? reconcilePhotoView(record.type, record.photoView)
        : (firstHeld !== undefined ? firstHeld : null));
    // The pair: the visit it was opened from, and its nearest neighbour with
    // photographs — the interval a clinician is standing in.
    const openedAt = target !== null && target.groupKey !== null
      ? target.groupKey
      : (record !== undefined
        ? (this.groupOfIn(props, record) || { key: null }).key : null);
    const index = visits.map(({ key }) => key).indexOf(openedAt as string);
    const aIndex = index > 0 ? index - 1 : 0;
    const bIndex = index > 0 ? index : (visits.length > 1 ? 1 : 0);
    return {
      mode: target !== null ? target.mode : 'position',
      imageId: target !== null ? target.imageId : null,
      view: view !== null
        ? view : (firstHeld !== undefined ? firstHeld : null),
      // What the enlarged reading's ‹ › walks: what the caller asked for, else the
      // series of the visit the photograph was pressed in.
      scope: target !== null && target.scope !== undefined ? target.scope : 'visit',
      aKey: visits.length > 0 ? visits[aIndex].key : null,
      // Never the same visit on both sides: with one photographed visit there is no
      // pair to show and the reading itself is unavailable (see `renderModes`).
      bKey: visits.length > 1
        ? visits[bIndex === aIndex ? (aIndex === 0 ? 1 : aIndex - 1) : bIndex].key
        : (visits.length > 0 ? visits[0].key : null),
      swapped: false,
      // Measured once the track is on screen, never assumed (see `measureStrip`).
      canScrollBack: false,
      canScrollOn: false,
    };
  }

  /**
   * What the across-visits track still holds off screen, on each side, read off
   * the element itself. Called on mount, on every update, on the track's own
   * scroll and on a window resize; it writes state only when the answer changes,
   * so it cannot loop with `componentDidUpdate`.
   */
  private measureStrip = () => {
    const el = this.strip;
    const back = el !== null && el.scrollLeft > 2;
    const on = el !== null
      && (el.scrollWidth - el.clientWidth - el.scrollLeft) > 2;
    if (back !== this.state.canScrollBack || on !== this.state.canScrollOn) {
      this.setState({ canScrollBack: back, canScrollOn: on });
    }
  };

  private setStrip = (node: HTMLDivElement | null) => {
    this.strip = node;
    this.measureStrip();
  };

  /** One press of an edge arrow: about two thirds of what is on screen. */
  private handleScrollStrip = (dir: number) => () => {
    const el = this.strip;
    if (el === null) {
      return;
    }
    el.scrollLeft += dir * Math.max(180, Math.round(el.clientWidth * 0.66));
    this.measureStrip();
  };

  /**
   * The photographs the enlarged reading's ‹ › walks, and the name of that walk
   * (see `PhotoSeqScope`). Derived on render from the record itself, so a
   * photograph removed while the viewer is open drops out of the walk with it.
   */
  private sequence(): { ids: string[]; label: string } {
    const record = this.currentRecord();
    const { scope, view } = this.state;
    if (record === undefined) {
      return { ids: [], label: '' };
    }
    if (scope === 'position' && view !== null) {
      const ids: string[] = [];
      photoVisits(this.props.groups).forEach((group) => {
        const cell = this.cellAt(group, view);
        if (cell !== null && cell.record !== null) {
          ids.push(cell.record.imageId);
        }
      });
      return { ids, label: `${getPhotoViewLabel(view)} across visits` };
    }
    const group = this.groupOf(record);
    if (group === undefined) {
      return { ids: [record.imageId], label: '' };
    }
    if (scope === 'stack' && view !== null) {
      const cell = this.cellAt(group, view);
      const ids: string[] = [];
      if (cell !== null && cell.record !== null) {
        ids.push(cell.record.imageId);
        cell.extras.forEach((extra) => ids.push(extra.imageId));
      }
      return {
        ids: ids.length > 0 ? ids : [record.imageId],
        label: `at ${getPhotoViewLabelInSentence(view)} · ${visitLabel(group)}`,
      };
    }
    // The visit's whole series in the composite's own reading order, extras and
    // unplaced photographs included — nothing of the visit is out of reach.
    const layout = buildPhotoSeries(group.records);
    const ids: string[] = [];
    layout.rows.forEach(({ cells }) => {
      cells.forEach((cell) => {
        if (cell.record !== null) {
          ids.push(cell.record.imageId);
          cell.extras.forEach((extra) => ids.push(extra.imageId));
        }
      });
    });
    layout.unplaced.forEach((r) => ids.push(r.imageId));
    return { ids, label: `${visitLabel(group)}’s photographs` };
  }

  /** How many visits hold each position — what the picker's chips report. */
  private countsByView(
    visits: Array<TimepointGroup<PatientRecord>>,
  ): { [view: string]: number } {
    const counts: { [view: string]: number } = {};
    visits.forEach((group) => {
      buildPhotoSeries(group.records).rows.forEach(({ cells }) => {
        cells.forEach(({ view, record }) => {
          if (record !== null) {
            counts[view.id] = (counts[view.id] !== undefined
              ? counts[view.id] : 0) + 1;
          }
        });
      });
    });
    return counts;
  }

  /** The cell of one visit's series at one position. */
  private cellAt(group: TimepointGroup<PatientRecord>, view: PhotoView) {
    const rows = buildPhotoSeries(group.records).rows;
    for (const { cells } of rows) {
      const match = cells.filter((cell) => cell.view.id === view)[0];
      if (match !== undefined) {
        return match;
      }
    }
    return null;
  }

  private findRecord(
    props: PhotoViewerProps, imageId: string,
  ): PatientRecord | undefined {
    for (const group of props.groups) {
      const match = group.records.filter((r) => r.imageId === imageId)[0];
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }

  private currentRecord(): PatientRecord | undefined {
    return this.state.imageId !== null
      ? this.findRecord(this.props, this.state.imageId) : undefined;
  }

  private groupOfIn(
    props: PhotoViewerProps, record: PatientRecord,
  ): TimepointGroup<PatientRecord> | undefined {
    return props.groups.filter(
      (group) => group.records.some((r) => r.imageId === record.imageId),
    )[0];
  }

  private groupOf(record: PatientRecord) {
    return this.groupOfIn(this.props, record);
  }

  private groupByKey(key: string | null) {
    return key === null
      ? undefined
      : this.props.groups.filter((group) => group.key === key)[0];
  }

  /** The line under the title in `single` mode: whose photograph, and when. */
  private recordCaption(record: PatientRecord): string {
    const group = this.groupOf(record);
    const date = formatCaptureDate(record.captureDate);
    const age = this.props.getAgeOn(record.captureDate);
    return [
      group !== undefined ? visitLabel(group) : null,
      date,
      age !== null ? `age ${age}` : null,
      'view only, not analysable',
    ].filter((part) => part !== null).join(' · ');
  }

  // ---- Handlers -------------------------------------------------------------

  private handleMode = (mode: PhotoViewerMode) => () => this.setState({ mode });

  private handlePickView = (view: PhotoView) => () => this.setState({ view });

  /**
   * The two sides are a from/to pair: picking the visit that is already on the
   * other side trades places with it, so the comparison can never become one visit
   * against itself.
   */
  private handlePickA = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    this.setState((state) => (key === state.bKey
      ? { aKey: key, bKey: state.aKey, swapped: true }
      : { aKey: key, bKey: state.bKey, swapped: false }));
  };

  private handlePickB = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    this.setState((state) => (key === state.aKey
      ? { bKey: key, aKey: state.bKey, swapped: true }
      : { bKey: key, aKey: state.aKey, swapped: false }));
  };

  /**
   * Enlarging from the across-visits strip keeps walking *that* comparison: ‹ ›
   * then steps the same position along the case, which is the reading the reader
   * pressed into.
   */
  private handleEnlarge = (record: PatientRecord) => () =>
    this.handleShowSingle(record, 'position');

  /** …and the "+N more here" line walks the photographs at that one position. */
  private handleOpenStack = (record: PatientRecord) => () =>
    this.handleShowSingle(record, 'stack');

  /** Enlarging from a visit's composite walks that visit's series. */
  private handleShowSingle = (
    record: PatientRecord, scope: PhotoSeqScope = 'visit',
  ) => this.setState({
    mode: 'single',
    imageId: record.imageId,
    // A stack is one position by definition, so the position on screen is kept;
    // otherwise the photograph's own position is what is being looked at.
    view: scope === 'stack'
      ? this.state.view
      : reconcilePhotoView(record.type, record.photoView),
    scope,
  });

  /** One step along the current walk (see `sequence`). */
  private handleStep = (delta: number) => () => {
    const seq = this.sequence();
    const index = seq.ids.indexOf(this.state.imageId as string);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= seq.ids.length) {
      return;
    }
    const record = this.findRecord(this.props, seq.ids[next]);
    if (record === undefined) {
      return;
    }
    this.setState({
      imageId: record.imageId,
      // Walking a visit's series moves the position with the photograph; walking a
      // position along the case, or a stack at one position, holds it.
      view: this.state.scope === 'visit'
        ? reconcilePhotoView(record.type, record.photoView)
        : this.state.view,
    });
  };

  private handleOpenRecord = (record: PatientRecord) => () =>
    this.props.onOpenRecord(record);

  private handleEdit = (record: PatientRecord) => () =>
    this.props.onEdit(record);

  private handleRemove = (record: PatientRecord) => () =>
    this.props.onRemove(record);
}

/**
 * One fact of a photograph. An absent value is stated as absent in muted type —
 * the idiom the record viewer's own `MetaRow` and the dashboard's `IdentityFact`
 * both use — and never blank, and never guessed.
 */
const FactRow = (
  { label, value, fallback, isNum }: {
    label: string;
    value: string | null;
    fallback?: string;
    isNum?: boolean;
  },
) => (
  <div className={classes.fact}>
    <span className={classes.fact_key}>{label}</span>
    <span
      className={cx(classes.fact_value, {
        [classes.fact_value__num]: isNum === true,
        [classes.fact_value__unset]: value === null,
      })}
    >
      {value !== null ? value : (fallback !== undefined ? fallback : 'Not recorded')}
    </span>
  </div>
);
