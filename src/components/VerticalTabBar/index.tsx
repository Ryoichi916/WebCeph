import * as React from 'react';
import Props, { TabCaption } from './props';

import * as cx from 'classnames';

import { getTimepointToken } from 'utils/records';

const classes = require('./style.scss');

/**
 * One visit's run of the rail: the tiles whose images were captured on the same
 * day, under one heading that names that day.
 *
 * The rail is the tracing editor's only index of the case, and a case is a
 * patient and their dated images — so the day is what it groups by, exactly as
 * the records dashboard's timeline does (`groupRecordsByTimepoint`). Ungrouped,
 * a 21-image case scrolled past as an undifferentiated strip of thumbnails: the
 * third of nine photographs of the first visit looked like the third of nine of
 * the last.
 */
interface RailGroup {
  /** Group identity: the capture day, or one of the two unfiled buckets. */
  key: string;
  /** The day these images were captured, or null where none is recorded. */
  date: string | null;
  /**
   * The timepoint the group's records agree on (`T1`), or null where they carry
   * none or disagree. Where it is known the heading states it and the tiles stop
   * repeating it; where the records disagree, each tile keeps saying its own.
   */
  timepoint: string | null;
  items: { id: string; index: number }[];
}

/** A tile with no record behind it at all — the empty tabs, kept last. */
const KEY_EMPTY = '__empty';
/** A record whose capture date was never entered. Never invented, never hidden. */
const KEY_UNDATED = '__undated';

class VerticalTabBar extends React.PureComponent<Props, { }> {
  handleTabClick = (id: string) => (_: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onTabChanged(id);
  }

  handleNewTab = (_: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onAddNewTab();
  }

  render() {
    const groups = this.getGroups();
    // A single run with nothing to say about itself (one new, empty tab; one
    // undated import) is not a group — a heading over the whole rail names
    // nothing the rail does not already show.
    const isGrouped = groups.length > 1 ||
      (groups.length === 1 && groups[0].date !== null);
    return (
      <div className={cx(classes.root, this.props.className)}>
        {groups.map((group) => (
          <div key={group.key} className={classes.group}>
            {isGrouped && group.key !== KEY_EMPTY
              ? this.renderGroupHead(group) : null}
            {group.items.map(({ id, index }) => this.renderTab(id, index, group))}
          </div>
        ))}
        { this.props.canAddWorkspace ? (
          <button
            className={classes.tab_item_placeholder}
            onClick={this.handleNewTab}
            title="Add another image"
            aria-label="Add another image"
          >
            <span className={classes.tab_add_glyph} aria-hidden="true">+</span>
            <span className={classes.tab_add_label}>Add image</span>
          </button>
        ) : null}
      </div>
    );
  }

  /**
   * The visit's heading: its timepoint and the day it was captured, in the
   * vocabulary the dashboard's stamps use. Sticky, so the run being scrolled
   * through always says which visit it belongs to.
   */
  private renderGroupHead = (group: RailGroup) => {
    const title = [
      group.timepoint,
      group.date !== null ? group.date : 'No capture date recorded',
    ].filter((part) => part !== null).join(' · ');
    return (
      <div className={classes.group_head} title={title}>
        {group.timepoint !== null ? (
          <span className={classes.group_tp}>{group.timepoint}</span>
        ) : null}
        <span
          className={cx(classes.group_date, {
            // A record with no capture date says so — a chart cannot be filed by
            // a date the record does not carry, and a heading that simply left
            // the line out read as a visit whose day the reader had missed.
            [classes.group_date__none]: group.date === null,
          })}
        >
          {group.date !== null ? group.date : 'No date'}
        </span>
      </div>
    );
  };

  private renderTab = (id: string, i: number, group: RailGroup) => {
    const isActiveTab = this.props.activeTabId === id;
    const thumbnail = this.props.thumbnails[id];
    // A tile that is waiting on a slot-directed upload states the filing
    // the clinician just chose — the proposed timepoint and the short type
    // — and wears the ghost tile's dashed, empty treatment. It used to be
    // a filled black square with a bare ordinal in it, which is exactly
    // what a *loaded* film whose thumbnail failed to render looks like.
    const pending = this.props.pendingWorkspaceId === id
      ? this.props.pendingCaption : null;
    const caption = this.props.captions[id] ||
      (pending !== null ? pending : undefined);
    const hasImage = thumbnail !== undefined;
    // The tile's primary caption is its timepoint when one is recorded.
    // Only the timepoint's first token is shown — a free-text label such
    // as "T3 pre-treatment" reads as "T3" here rather than ellipsizing to
    // "T3 pr…"; the full label stays in the tile's tooltip below.
    //
    // A film that carries NO timepoint says so, in the phrase the rest of
    // the app names an unlabelled visit by: captioned with its ordinal, a
    // rail holding an imported film read "T1 · T1 · T2 … T3 · 8", where
    // the 8 was indistinguishable from a visit label. Only an empty tile
    // keeps its ordinal — there it is a position in the rail and nothing
    // else. @see utils/visitNotes#getVisitNoteVisitName
    const primaryCaption =
      (caption && getTimepointToken(caption.timepoint)) ||
      // A pending tile whose slot carried no timepoint says it is the new
      // one rather than borrowing an ordinal it shares with a film.
      (pending !== null ? 'New' : (hasImage ? 'No visit' : `${i + 1}`));
    // …and it is not repeated under every tile of a run the heading has just
    // named: nine photographs of one visit stamped "T1" nine times pushed the
    // one caption that tells them apart — the position each was shot in — down
    // to the smallest type in the rail.
    const isNamedByHead = group.timepoint !== null &&
      caption !== undefined &&
      getTimepointToken(caption.timepoint) === group.timepoint;
    const label = caption !== undefined
      ? caption.fullLabel
      : `Image ${i + 1}`;
    return (
      <button
        tabIndex={0}
        key={id}
        className={cx(classes.tab_item, {
          [classes.tab_item__active]: isActiveTab,
          [classes.tab_item__thumbnail]: hasImage,
          [classes.tab_item__pending]: pending !== null,
        })}
        onClick={!isActiveTab ? this.handleTabClick(id) : undefined}
        title={label}
        aria-label={label}
        aria-pressed={isActiveTab}
      >
        {hasImage ? (
          <span className={classes.tab_preview}>
            <img
              className={classes.tab_thumbnail}
              src={thumbnail}
              alt=""
              draggable={false}
            />
          </span>
        ) : (
          /* No image in this tile: the empty, dashed treatment of the
             rail's own ghost tile — never the canvas black, which is what
             a film is displayed on.
             **And it says what it is.** An empty tile used to be a dashed box
             containing the bare numeral of its position — "13" at the foot of a
             twelve-image rail, with no plus, no label and nothing else in it. It
             is the control that files the next image; nobody could know that, and
             "13" beside a run of visits labelled T1, T2, T3 reads as a visit. So
             it wears the same plus and the same words the rail's own ghost tile
             wears (see `render`), and the position becomes the tile's secondary
             caption where it is worth showing at all. */
          <span className={cx(classes.tab_preview, classes.tab_preview__empty)}>
            <span className={classes.tab_add_glyph} aria-hidden="true">+</span>
            <span className={classes.tab_add_label}>Add image</span>
          </span>
        )}
        {/* The tile's own primary caption: the visit for a film, what it is
            filing for a pending tile, and — for an empty tile, whose face now
            carries the act instead of a numeral — its position in the rail, set
            quietly, because a position is the least of what this rail says. */}
        {(hasImage || pending !== null) && !isNamedByHead ? (
          <span className={classes.tab_index}>{primaryCaption}</span>
        ) : null}
        {!hasImage && pending === null ? (
          <span className={cx(classes.tab_index, classes.tab_index__ordinal)}>
            {`No. ${i + 1}`}
          </span>
        ) : null}
        {caption !== undefined ? (
          // Set to wrap rather than ellipsize: the rail is where a photograph is
          // identified by the position it was shot in, and at 60px of tile
          // "Frontal (centre)" was cut to "Frontal (c…" — which names neither
          // the frame nor, beside "Frontal rest", the photograph.
          <span className={classes.tab_type}>{caption.typeLabel}</span>
        ) : null}
      </button>
    );
  };

  /**
   * The rail's tiles, gathered into their visits: one run per capture day, in
   * date order, then the records that carry no date, then the empty tabs.
   *
   * Ordered by the day rather than by tab order because that is the order a
   * case is read in, and it is the order the dashboard, the timeline, the
   * superimposition and the printed chart all put the same films in — the rail
   * was the one place they appeared in upload order.
   */
  private getGroups = (): RailGroup[] => {
    const { tabs, captions, pendingWorkspaceId, pendingCaption } = this.props;
    const groups: RailGroup[] = [];
    const at: { [key: string]: number | undefined } = {};
    tabs.forEach((id, index) => {
      const caption: TabCaption | undefined = captions[id] ||
        (pendingWorkspaceId === id && pendingCaption !== null
          ? pendingCaption : undefined);
      const date = caption !== undefined ? caption.captureDate : null;
      const key = caption === undefined
        ? KEY_EMPTY : (date !== null ? date : KEY_UNDATED);
      const found = at[key];
      let group: RailGroup;
      if (found === undefined) {
        group = {
          key,
          date,
          timepoint: caption !== undefined
            ? getTimepointToken(caption.timepoint) : null,
          items: [],
        };
        at[key] = groups.length;
        groups.push(group);
      } else {
        group = groups[found];
        // Two records filed on the same day under different timepoint labels:
        // the heading states the day only, and each tile keeps its own label.
        const token = caption !== undefined
          ? getTimepointToken(caption.timepoint) : null;
        if (token !== group.timepoint) {
          group.timepoint = null;
        }
      }
      group.items.push({ id, index });
    });
    // Dated visits in date order (ISO sorts chronologically), then the undated
    // records, then the empty tabs — which are positions in the rail, not
    // records, and belong at its foot where "Add image" is.
    const rank = (g: RailGroup) => (
      g.key === KEY_EMPTY ? 2 : (g.key === KEY_UNDATED ? 1 : 0)
    );
    return groups.sort((a, b) => {
      if (rank(a) !== rank(b)) {
        return rank(a) - rank(b);
      }
      if (a.date === null || b.date === null) {
        return 0;
      }
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
  };
}

export default VerticalTabBar;
