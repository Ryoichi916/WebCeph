import * as React from 'react';

import * as cx from 'classnames';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import { PatientRecord } from 'store/reducers/workspace';

import PhotoSeries from './PhotoSeries';

import {
  buildPhotoSeries,
  formatCaptureDate,
  getPhotoViewLabel,
  getPhotoViewShortLabel,
  getTimepointToken,
  getTodayISO,
  findPhotoView,
  PHOTO_SERIES_ROWS,
  PHOTO_VIEW_OPTIONS,
  PhotoViewOption,
  TimepointGroup,
} from 'utils/records';

const classes = require('./addphotoseries.scss');

/** One chosen file, and the position it will be filed at. */
interface Item {
  key: string;
  file: File;
  /** A preview of the file, read locally — null until the read finishes. */
  url: string | null;
  view: PhotoView | null;
}

export interface AddPhotoSeriesProps {
  open: boolean;
  /** The visit the batch is filed at — its label, its day and the age on it. */
  timepoint: string | null;
  captureDate: string | null;
  age: string | null;
  /** The visit itself, for what is already on file and for the empty composite. */
  group: TimepointGroup<PatientRecord> | null;
  /**
   * Files the clinician dropped on the visit's series tile, where that is how the
   * dialog was opened. The drop is the whole point: a clinic shoots the series in
   * one sitting and files it in one act.
   */
  initialFiles: File[] | null;
  onClose(): any;
  /** File the batch — one entry per photograph, each with its own record meta. */
  onFile(entries: Array<{ file: File; meta: ImageRecordMeta }>): any;
  /** File one named frame the long way, through the upload form. */
  onFillOne(view: PhotoViewOption): any;
  /** Enlarge a photograph already on file at this visit. */
  onOpenPhoto(record: PatientRecord): any;
}

interface State {
  items: Item[];
  /** Whether a drag is currently over the drop area. */
  isOver: boolean;
}

let seq = 0;
const nextKey = () => `photo_${(seq += 1)}`;

/** Only images: a .wceph project or a PDF dropped here is not a photograph. */
const isImageFile = (file: File): boolean =>
  file.type === '' || file.type.indexOf('image/') === 0;

/**
 * Which positions a batch of `count` files is proposed at: the series' own reading
 * order, skipping the positions this visit already holds, and continuing through
 * the whole order once the free ones run out (a re-shoot is filed at a position
 * that is already occupied, and the record keeps both).
 *
 * A proposal, never a decision: every row's position is on screen and editable
 * before anything is filed, exactly as the upload form's own Position field is.
 */
const proposeViews = (count: number, taken: PhotoView[]): PhotoView[] => {
  const free = PHOTO_VIEW_OPTIONS
    .filter(({ id }) => taken.indexOf(id) < 0)
    .map(({ id }) => id);
  const all = PHOTO_VIEW_OPTIONS.map(({ id }) => id);
  const order = free.concat(all);
  const out: PhotoView[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(order[i % order.length]);
  }
  return out;
};

/**
 * Filing a whole photographic series into one visit, in one act.
 *
 * **Why this exists.** A nine-frame series was nine separate full-page uploads:
 * every empty cell left the records dashboard for the upload screen, filed one
 * photograph, landed in the record viewer, and had to be navigated back and
 * re-scrolled before the next cell could be pressed. The cell's own act threw the
 * clinician off the surface they pressed it on, nine times for one sitting's
 * photographs.
 *
 * **What it does not do.** It does not guess. The positions are *proposed* in the
 * series' reading order (skipping the ones the visit already holds) and every one
 * of them is a select the clinician can change before a single record is written;
 * the visit, its day and the age on that day are stated in the head rather than
 * asked for again; and where two rows name one position, or a row names a position
 * the visit already holds, the row says so instead of quietly overwriting
 * anything — a second photograph at a position is kept as a second photograph.
 *
 * Nothing here traces or analyses: these are photographs, and the dialog says so
 * in the same words the series tile and the photograph viewer use.
 */
export default class AddPhotoSeries extends React.PureComponent<AddPhotoSeriesProps, State> {
  state: State = { items: [], isOver: false };

  private isMounted_ = false;
  private input: HTMLInputElement | null = null;

  componentDidMount() {
    this.isMounted_ = true;
    if (this.props.open) {
      this.take(this.props.initialFiles);
    }
  }

  componentWillUnmount() {
    this.isMounted_ = false;
  }

  componentWillReceiveProps(next: AddPhotoSeriesProps) {
    // Opening starts from what was actually handed in — the files of the drop
    // that opened it, or nothing — never from the previous batch.
    if (next.open && !this.props.open) {
      this.setState({ items: [], isOver: false });
      this.take(next.initialFiles);
    }
  }

  render() {
    const { open, onClose } = this.props;
    const { items } = this.state;
    const visit = this.visitName();
    const day = this.day();
    return (
      <Dialog
        open={open}
        modal={false}
        onRequestClose={onClose}
        className={classes.no_print}
        overlayClassName={classes.no_print}
        title={
          <div className={classes.title}>
            <h3 className={classes.title_heading}>
              {`Add photographs to ${visit}`}
            </h3>
            <span className={classes.title_caption}>
              {this.headCaption()}
            </span>
          </div>
        }
        actions={[
          <FlatButton
            key="cancel"
            label="Cancel"
            labelStyle={{ textTransform: 'none' }}
            onClick={onClose}
          />,
          <RaisedButton
            key="file"
            primary
            disabled={items.length === 0}
            label={items.length === 0
              ? 'File photographs'
              : (items.length === 1
                ? 'File 1 photograph'
                : `File ${items.length} photographs`)}
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            onClick={this.handleFile}
          />,
        ]}
        autoScrollBodyContent
        contentStyle={{ width: '96%', maxWidth: 900 }}
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
        <div
          className={cx(classes.drop, {
            [classes.drop__over]: this.state.isOver,
          })}
          onDragOver={this.handleDragOver}
          onDragEnter={this.handleDragOver}
          onDragLeave={this.handleDragLeave}
          onDrop={this.handleDrop}
        >
          <span className={classes.drop_text}>
            Drop the visit's photographs here — all of them at once
          </span>
          <RaisedButton
            primary
            label="Choose photographs…"
            labelStyle={{ textTransform: 'none', fontWeight: 600 }}
            onClick={this.openPicker}
          />
          <input
            ref={this.setInput}
            className={classes.drop_input}
            type="file"
            accept="image/*"
            multiple
            onChange={this.handlePick}
          />
          <span className={classes.drop_hint}>
            {`Filed at ${visit}${day !== null ? ` · ${day}` : ''} — positions are ` +
              'proposed in series order and every one of them is editable below.'}
          </span>
        </div>
        {items.length > 0 ? this.renderItems() : this.renderComposite()}
      </Dialog>
    );
  }

  // ---- The batch --------------------------------------------------------------

  /** One row per chosen file: what it is, and which frame it is filed at. */
  private renderItems = () => {
    const { items } = this.state;
    const taken = this.takenViews();
    const counts: { [view: string]: number } = {};
    items.forEach(({ view }) => {
      if (view !== null) {
        counts[view] = (counts[view] !== undefined ? counts[view] : 0) + 1;
      }
    });
    return (
      <div className={classes.list}>
        <div className={classes.list_head}>
          <span className={classes.list_title}>
            {items.length === 1
              ? '1 photograph to file'
              : `${items.length} photographs to file`}
          </span>
          <span className={classes.list_note}>
            Change any position before filing — nothing is written until then.
          </span>
        </div>
        {items.map((item, index) => {
          const view = findPhotoView(item.view);
          // Two rows on one position, or a position this visit already holds:
          // stated, and allowed — a re-shoot is a real thing, and the record keeps
          // both photographs rather than one silently replacing the other.
          const isRepeat = item.view !== null && counts[item.view] > 1;
          const isOccupied = item.view !== null && taken.indexOf(item.view) >= 0;
          return (
            <div key={item.key} className={classes.row}>
              <span className={cx(classes.row_frame, {
                [classes.row_frame__landscape]: view !== undefined
                  && view.frame === 'landscape',
              })}
              >
                {item.url !== null ? (
                  <img
                    className={classes.row_img}
                    src={item.url}
                    alt=""
                    draggable={false}
                  />
                ) : null}
              </span>
              <span className={classes.row_main}>
                <span className={classes.row_name}>{item.file.name}</span>
                <span className={classes.row_field}>
                  <span className={classes.row_key}>Position</span>
                  <select
                    className={classes.row_select}
                    value={item.view !== null ? item.view : ''}
                    aria-label={`Series position of ${item.file.name}`}
                    onChange={this.handlePickView(index)}
                  >
                    {PHOTO_SERIES_ROWS.map((row) => (
                      <optgroup key={row.key} label={row.label}>
                        {row.views.map((id) => (
                          <option key={id} value={id}>
                            {getPhotoViewLabel(id)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </span>
                {isRepeat || isOccupied ? (
                  <span className={classes.row_warn}>
                    {isOccupied
                      ? `${getPhotoViewShortLabel(item.view)} is already on file ` +
                        `at ${this.visitName()} — this is filed as a second ` +
                        'photograph at that position, not over it'
                      : `Two of these are filed at ` +
                        `${getPhotoViewShortLabel(item.view)}`}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className={classes.row_drop}
                title={`Leave ${item.file.name} out of this batch`}
                onClick={this.handleDropItem(index)}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * The visit's own composite, where the visit holds no photographs yet: the nine
   * named frames, each of which files at exactly *that* frame through the upload
   * form. It is the same grid the records page draws, so the first photograph of a
   * series is filed at a named position like the second through the ninth are —
   * "Add intraoral photo" could only name a type, and proposed the centre frame for
   * what may well be a buccal segment.
   */
  private renderComposite = () => {
    const { group } = this.props;
    if (group === null) {
      return null;
    }
    const series = buildPhotoSeries(group.records);
    if (series.total > 0) {
      // The visit already has a series and the page behind this dialog is drawing
      // it: repeating it here would be the same composite twice on one screen.
      return (
        <p className={classes.have}>
          {series.filled === 1
            ? `1 of the 9 positions is already on file at ${this.visitName()}.`
            : `${series.filled} of the 9 positions are already on file at ` +
              `${this.visitName()}.`}
          {' '}
          Anything added here is filed alongside them.
        </p>
      );
    }
    return (
      <div className={classes.start}>
        <span className={classes.start_label}>
          Or start one frame at a time
        </span>
        <PhotoSeries
          group={group}
          records={group.records}
          onOpenPhoto={this.props.onOpenPhoto}
          onFill={this.props.onFillOne}
        />
      </div>
    );
  };

  // ---- Reading the visit ------------------------------------------------------

  private visitName = (): string => {
    const { timepoint } = this.props;
    const token = getTimepointToken(timepoint);
    return token !== null ? token : (timepoint !== null ? timepoint : 'this visit');
  };

  /** The day the batch is stamped with — the visit's, or today where it has none. */
  private day = (): string | null =>
    formatCaptureDate(this.props.captureDate);

  private headCaption = (): string => {
    const { captureDate, age } = this.props;
    const parts: string[] = [];
    if (captureDate !== null) {
      parts.push(captureDate);
    } else {
      parts.push(`no day on file for this visit — filed as ${getTodayISO()}`);
    }
    if (age !== null) {
      parts.push(`age ${age}`);
    }
    parts.push('photographs are kept with the record and are not traced or analysed');
    return parts.join(' · ');
  };

  /** The positions this visit already holds. */
  private takenViews = (): PhotoView[] => {
    const { group } = this.props;
    if (group === null) {
      return [];
    }
    const taken: PhotoView[] = [];
    buildPhotoSeries(group.records).rows.forEach(({ cells }) => {
      cells.forEach(({ view, record }) => {
        if (record !== null) {
          taken.push(view.id);
        }
      });
    });
    return taken;
  };

  // ---- Handlers ---------------------------------------------------------------

  /** Add files to the batch, each proposed at the next free position. */
  private take = (files: File[] | null) => {
    if (files === null || files.length === 0) {
      return;
    }
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      return;
    }
    this.setState((state) => {
      const taken = this.takenViews().concat(
        state.items
          .map(({ view }) => view)
          .filter((view): view is PhotoView => view !== null),
      );
      const proposed = proposeViews(images.length, taken);
      const added = images.map((file, i): Item => ({
        key: nextKey(),
        file,
        url: null,
        view: proposed[i],
      }));
      added.forEach((item) => this.readPreview(item));
      return { items: state.items.concat(added), isOver: false };
    });
  };

  /** A local preview of one chosen file — never uploaded anywhere, read in page. */
  private readPreview = (item: Item) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!this.isMounted_) {
        return;
      }
      const url = typeof reader.result === 'string' ? reader.result : null;
      this.setState((state) => ({
        items: state.items.map(
          (i) => (i.key === item.key ? { ...i, url } : i),
        ),
      }));
    };
    reader.readAsDataURL(item.file);
  };

  private setInput = (node: HTMLInputElement | null) => this.input = node;

  private openPicker = () => {
    if (this.input !== null) {
      this.input.click();
    }
  };

  private handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files !== null) {
      const list: File[] = [];
      for (let i = 0; i < files.length; i += 1) {
        list.push(files[i]);
      }
      this.take(list);
    }
    // …so choosing the same file twice in a row still fires a change.
    e.target.value = '';
  };

  private handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!this.state.isOver) {
      this.setState({ isOver: true });
    }
  };

  private handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState({ isOver: false });
  };

  private handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const list: File[] = [];
    const { files } = e.dataTransfer;
    for (let i = 0; i < files.length; i += 1) {
      list.push(files[i]);
    }
    this.setState({ isOver: false });
    this.take(list);
  };

  private handlePickView = (index: number) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const view = e.target.value as PhotoView;
      this.setState((state) => ({
        items: state.items.map(
          (item, i) => (i === index ? { ...item, view } : item),
        ),
      }));
    };

  private handleDropItem = (index: number) => () =>
    this.setState((state) => ({
      items: state.items.filter((_, i) => i !== index),
    }));

  private handleFile = () => {
    const { timepoint, captureDate } = this.props;
    const day = captureDate !== null ? captureDate : getTodayISO();
    const entries = this.state.items
      .filter(({ view }) => view !== null)
      .map(({ file, view }) => {
        const option = findPhotoView(view) as PhotoViewOption;
        return {
          file,
          meta: {
            // The position and the type are one fact: the frame decides the type
            // it is filed as, exactly as the series cells and the upload form do.
            type: option.imageType,
            timepoint,
            captureDate: day,
            photoView: option.id,
          } as ImageRecordMeta,
        };
      });
    if (entries.length > 0) {
      this.props.onFile(entries);
    }
    this.props.onClose();
  };
}
