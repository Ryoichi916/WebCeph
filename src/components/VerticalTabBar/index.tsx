import * as React from 'react';
import Props from './props';

import map from 'lodash/map';

import * as cx from 'classnames';

import { getTimepointToken } from 'utils/records';

const classes = require('./style.scss');

class VerticalTabBar extends React.PureComponent<Props, { }> {
  handleTabClick = (id: string) => (_: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onTabChanged(id);
  }

  handleNewTab = (_: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onAddNewTab();
  }

  render() {
    return (
      <div className={cx(classes.root, this.props.className)}>
        {map(this.props.tabs, (id, i) => {
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
          // The tile's primary caption is its timepoint when one is recorded;
          // an unfiled image falls back to its position in the rail rather
          // than being labelled with a timepoint it does not have.
          // Only the timepoint's first token is shown — a free-text label such
          // as "T3 pre-treatment" reads as "T3" here rather than ellipsizing to
          // "T3 pr…"; the full label stays in the tile's tooltip below.
          const primaryCaption =
            (caption && getTimepointToken(caption.timepoint)) ||
            // A pending tile whose slot carried no timepoint says it is the new
            // one rather than borrowing an ordinal it shares with a film.
            (pending !== null ? 'New' : `${i + 1}`);
          const label = caption !== undefined
            ? caption.fullLabel
            : `Image ${i + 1}`;
          const hasImage = thumbnail !== undefined;
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
                   a film is displayed on. A tile awaiting a directed upload
                   shows the plus it is waiting for; an ordinary empty tile keeps
                   its ordinal. */
                <span className={cx(classes.tab_preview, classes.tab_preview__empty)}>
                  <span className={classes.tab_number}>
                    {pending !== null ? '+' : i + 1}
                  </span>
                </span>
              )}
              {/* An ordinary image-less tile already shows its number inside the
                  tile, so it gets no caption underneath. A pending tile does get
                  one: the timepoint and type it is filing. */}
              {hasImage || pending !== null ? (
                <span className={classes.tab_index}>{primaryCaption}</span>
              ) : null}
              {caption !== undefined ? (
                <span className={classes.tab_type}>{caption.typeLabel}</span>
              ) : null}
            </button>
          );
        })}
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
}

export default VerticalTabBar;
