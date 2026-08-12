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
  formatCaptureDate,
  formatInterval,
  getImageTypeLabel,
  getPhotoViewLabel,
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

/** What the viewer was opened on. */
export interface PhotoViewerTarget {
  mode: PhotoViewerMode;
  /** The photograph pressed, where one was. */
  imageId: string | null;
  /** The position it belongs to (or the position a comparison was asked for). */
  view: PhotoView | null;
  /** The visit it was opened from — seeds the two-visit comparison. */
  groupKey: string | null;
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
  /** The two visits compared in `series` mode, by group key. */
  aKey: string | null;
  bKey: string | null;
}

/** How a visit is named in this viewer's captions: its pill, then its day. */
const visitLabel = (group: TimepointGroup<PatientRecord>): string => {
  const token = getTimepointToken(group.label);
  return token !== null ? token : getVisitPill(group.label).token;
};

/** Every visit that holds at least one photograph — the photographic chronology. */
const photoVisits = (
  groups: Array<TimepointGroup<PatientRecord>>,
): Array<TimepointGroup<PatientRecord>> =>
  groups.filter(
    (group) => group.records.some(({ type }) => isPhotographType(type)),
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

  componentWillReceiveProps(next: PhotoViewerProps) {
    // Re-opening starts from what was actually pressed, never from the previous
    // reading — the same rule the record dialogs of this surface follow.
    if (next.open && !this.props.open) {
      this.setState(this.seed(next));
    }
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

  /** One photograph, as large as the window allows. */
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
    return (
      <div className={classes.single}>
        <div className={classes.single_frame}>
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
   * One position, at every visit that photographed it — the comparison a
   * clinician actually reads (see this class's own doc comment).
   *
   * Every visit with photographs gets a column, including the ones that do *not*
   * hold this position: an empty column is the honest statement that the frame was
   * not taken then, and hiding it would silently compress the chronology.
   */
  private renderPosition = (visits: Array<TimepointGroup<PatientRecord>>) => {
    const { view } = this.state;
    const held = this.countsByView(visits);
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
          <div className={classes.strip}>
            {visits.map((group, index) => {
              const cell = view !== null
                ? this.cellAt(group, view) : null;
              const record = cell !== null ? cell.record : null;
              const since = index > 0
                ? formatInterval(
                  parseCaptureDate(visits[index - 1].firstDate),
                  parseCaptureDate(group.firstDate),
                )
                : null;
              return (
                <div key={group.key} className={classes.strip_col}>
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
                      <span className={classes.strip_none}>Not on file</span>
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
                  {cell !== null && cell.extras.length > 0 ? (
                    <span className={classes.strip_more}>
                      {`+${cell.extras.length} more filed at this position`}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /** Two visits' whole series, side by side — the records-sheet reading. */
  private renderSeries = (visits: Array<TimepointGroup<PatientRecord>>) => {
    const a = this.groupByKey(this.state.aKey);
    const b = this.groupByKey(this.state.bKey);
    const interval = a !== undefined && b !== undefined
      ? formatInterval(
        parseCaptureDate(a.firstDate), parseCaptureDate(b.firstDate),
      )
      : null;
    return (
      <div className={classes.pair}>
        {interval !== null ? (
          <p className={classes.pair_interval}>
            {interval} apart
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
                  aria-label={key === 'a' ? 'Earlier visit' : 'Later visit'}
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
      aKey: visits.length > 0 ? visits[aIndex].key : null,
      bKey: visits.length > 0 ? visits[bIndex].key : null,
    };
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

  private handlePickA = (e: React.ChangeEvent<HTMLSelectElement>) =>
    this.setState({ aKey: e.target.value });

  private handlePickB = (e: React.ChangeEvent<HTMLSelectElement>) =>
    this.setState({ bKey: e.target.value });

  /** Enlarging from a comparison keeps the comparison's own position. */
  private handleEnlarge = (record: PatientRecord) => () =>
    this.handleShowSingle(record);

  private handleShowSingle = (record: PatientRecord) => this.setState({
    mode: 'single',
    imageId: record.imageId,
    view: reconcilePhotoView(record.type, record.photoView),
  });

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
