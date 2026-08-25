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
  getImageTypeLabel,
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
  /**
   * The photograph's own pixel size, measured from the decoded preview — null
   * until it has decoded, and the whole basis of the proposal (see `assignViews`):
   * a landscape file is an intraoral or occlusal frame, a portrait one is facial,
   * and the app can see which without asking the clinician.
   */
  pxW: number | null;
  pxH: number | null;
  /**
   * Whether the clinician has chosen this row's position themselves. A pinned row
   * is never re-proposed — the proposal rearranges the rows *around* the choice
   * rather than over it.
   */
  pinned: boolean;
}

/** Which frame a photograph of this shape is shot in, or null where it cannot say. */
const frameOfShape = (
  pxW: number | null, pxH: number | null,
): 'portrait' | 'landscape' | null => {
  if (pxW === null || pxH === null || pxW <= 0 || pxH <= 0) {
    return null;
  }
  const aspect = pxW / pxH;
  // A near-square photograph is not evidence of either frame, so it constrains
  // nothing and warns about nothing: the app only ever states what it can see.
  if (aspect > 1.02) {
    return 'landscape';
  }
  return aspect < 0.98 ? 'portrait' : null;
};

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
 * Which position each unpinned row is proposed at: the series' own reading order
 * **among the frames the photograph's own shape can be**, skipping the positions
 * this visit already holds and the ones this batch has already taken, and
 * continuing through that shape's frames once the free ones run out (a re-shoot is
 * filed at a position that is already occupied, and the record keeps both).
 *
 * **Why the shape decides.** Assigned by series order alone, a nine-file drop
 * proposed the first four files at the facial frames whatever they were — so a
 * 1024 × 683 landscape intraoral photograph was proposed at "Three-quarter
 * (oblique)", a portrait facial frame, and would have been *written as*
 * `photo_frontal` (the frame decides the type — see `handleFile`) if the row were
 * filed uncorrected. Nothing was dishonest about it, every row being on screen and
 * editable, but it meant hand-correcting nine rows using a fact the app had already
 * measured and was even drawing: the row's own thumbnail frame.
 *
 * Still a proposal, never a decision: every row's position is on screen and
 * editable before anything is filed, a row whose chosen position disagrees with the
 * photograph's shape says so (see `renderItems`), and a file whose shape says
 * nothing — a square, or one that has not decoded yet — is proposed in the plain
 * series order this replaces.
 */
const assignViews = (items: Item[], taken: PhotoView[]): Item[] => {
  const used = taken.slice();
  items.forEach((item) => {
    if (item.pinned && item.view !== null) {
      used.push(item.view);
    }
  });
  let overflow = 0;
  return items.map((item) => {
    if (item.pinned) {
      return item;
    }
    const frame = frameOfShape(item.pxW, item.pxH);
    const pool = frame === null
      ? PHOTO_VIEW_OPTIONS
      : PHOTO_VIEW_OPTIONS.filter((option) => option.frame === frame);
    const free = pool.filter(({ id }) => used.indexOf(id) < 0);
    let pick: PhotoViewOption;
    if (free.length > 0) {
      pick = free[0];
    } else {
      // Every frame of this shape is already spoken for: the extras walk that
      // shape's frames in order rather than piling onto one of them.
      pick = pool[overflow % pool.length];
      overflow += 1;
    }
    used.push(pick.id);
    return item.view === pick.id ? item : { ...item, view: pick.id };
  });
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
 * **What it does not do.** It does not guess. Each position is *proposed* from the
 * photograph's own measured shape — a landscape file at the intraoral and occlusal
 * frames, a portrait one at the facial frames, in the series' reading order within
 * that shape and skipping the positions the visit already holds (see
 * `assignViews`) — and every one of them is a select the clinician can change
 * before a single record is written;
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
            <h3 id="add-photo-series-title" className={classes.title_heading}>
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
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'add-photo-series-title',
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
            {`Filed at ${visit}${day !== null ? ` · ${day}` : ''} — each position ` +
              "is proposed from the photograph's own shape (landscape frames " +
              'intraoral, portrait frames facial) and every one of them is editable ' +
              'below.'}
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
            Positions are proposed from each photograph's own shape — change any of
            them before filing; nothing is written until then.
          </span>
        </div>
        {items.map((item, index) => {
          const view = findPhotoView(item.view);
          // Two rows on one position, or a position this visit already holds:
          // stated, and allowed — a re-shoot is a real thing, and the record keeps
          // both photographs rather than one silently replacing the other.
          const isRepeat = item.view !== null && counts[item.view] > 1;
          const isOccupied = item.view !== null && taken.indexOf(item.view) >= 0;
          // …and a position that disagrees with the photograph's own shape: a
          // landscape file at a portrait facial frame would be *written as* a
          // frontal photograph (the frame decides the type), so the row says what
          // it can see, in the same voice as "already on file at T1", and files it
          // anyway if that is what the clinician means.
          const shape = frameOfShape(item.pxW, item.pxH);
          const isMisshapen = view !== undefined && shape !== null
            && view.frame !== shape;
          return (
            <div key={item.key} className={classes.row}>
              {/* The thumbnail is framed by the *photograph's* shape where it is
                  known, not by the position's: the frame is evidence about the file,
                  and letterboxing a landscape photograph into a portrait box was the
                  app hiding the very fact the warning beside it is about. */}
              <span className={cx(classes.row_frame, {
                [classes.row_frame__landscape]: shape !== null
                  ? shape === 'landscape'
                  : (view !== undefined && view.frame === 'landscape'),
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
                <span className={classes.row_name}>
                  {item.file.name}
                  {/* The measured shape, beside the name: the fact the proposal was
                      made on, stated rather than implied. */}
                  {item.pxW !== null && item.pxH !== null ? (
                    <span className={classes.row_px}>
                      {`${item.pxW} × ${item.pxH}`}
                    </span>
                  ) : null}
                </span>
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
                {isMisshapen && view !== undefined ? (
                  <span className={classes.row_warn}>
                    {`This photograph is ${shape === 'landscape'
                      ? 'landscape (wider than tall)'
                      : 'portrait (taller than wide)'} and ${view.label} is a ` +
                      `${view.frame} frame, filed as ` +
                      `${getImageTypeLabel(view.imageType).toLowerCase()} — check ` +
                      'the position before filing'}
                  </span>
                ) : null}
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
    // A record with no visits yet has no group to read — which is *the* case this
    // composite exists for. Both entry points into the dialog on a fresh record
    // (the whole-record empty state, and the no-visits slot row) carry a proposed
    // timepoint and day but no group, and returning null for them left "Add
    // photographs" on a brand-new patient as a bare drop zone: no nine frames, no
    // "Or start one frame at a time", i.e. everything this dialog says about filing
    // the *first* photograph of a series at a named frame was missing from the one
    // place a first photograph is filed. So the visit the batch would create is
    // synthesised — holding nothing, which is exactly what it holds.
    const group: TimepointGroup<PatientRecord> = this.props.group !== null
      ? this.props.group
      : {
        key: '',
        label: this.props.timepoint,
        records: [],
        firstDate: this.props.captureDate,
        lastDate: this.props.captureDate,
        undatedCount: 0,
      };
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

  /**
   * Add files to the batch, each proposed at the next free position its own shape
   * can be (see `assignViews`). The shape arrives with the preview, a moment after
   * the row does, so the rows are proposed again as each file decodes — a row the
   * clinician has already set is left exactly where they put it.
   */
  private take = (files: File[] | null) => {
    if (files === null || files.length === 0) {
      return;
    }
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      return;
    }
    this.setState((state) => {
      const added = images.map((file): Item => ({
        key: nextKey(),
        file,
        url: null,
        view: null,
        pxW: null,
        pxH: null,
        pinned: false,
      }));
      added.forEach((item) => this.readPreview(item));
      return {
        items: assignViews(state.items.concat(added), this.takenViews()),
        isOver: false,
      };
    });
  };

  /**
   * A local preview of one chosen file — never uploaded anywhere, read in page —
   * and, from the decoded preview, the photograph's pixel size: the fact the
   * proposal is made on and the fact a disagreeing position is stated against.
   */
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
      if (url !== null) {
        this.measure(item.key, url);
      }
    };
    reader.readAsDataURL(item.file);
  };

  /** The decoded photograph's pixel size, and the proposal re-made on it. */
  private measure = (key: string, url: string) => {
    const img = new Image();
    img.onload = () => {
      if (!this.isMounted_) {
        return;
      }
      const pxW = img.naturalWidth;
      const pxH = img.naturalHeight;
      this.setState((state) => ({
        items: assignViews(
          state.items.map(
            (i) => (i.key === key ? { ...i, pxW, pxH } : i),
          ),
          this.takenViews(),
        ),
      }));
    };
    img.src = url;
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

  /**
   * The clinician's own choice for one row — which pins it: the proposal then
   * rearranges the *other* unpinned rows around it rather than over it, so setting
   * one row cannot silently leave two rows on one position.
   */
  private handlePickView = (index: number) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const view = e.target.value as PhotoView;
      this.setState((state) => ({
        items: assignViews(
          state.items.map(
            (item, i) => (i === index ? { ...item, view, pinned: true } : item),
          ),
          this.takenViews(),
        ),
      }));
    };

  private handleDropItem = (index: number) => () =>
    this.setState((state) => ({
      // Dropping a row frees its position, so the unpinned rows are proposed again
      // over what is left.
      items: assignViews(
        state.items.filter((_, i) => i !== index), this.takenViews(),
      ),
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
