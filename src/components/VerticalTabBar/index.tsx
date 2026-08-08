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
          const caption = this.props.captions[id];
          // The tile's primary caption is its timepoint when one is recorded;
          // an unfiled image falls back to its position in the rail rather
          // than being labelled with a timepoint it does not have.
          // Only the timepoint's first token is shown — a free-text label such
          // as "T3 pre-treatment" reads as "T3" here rather than ellipsizing to
          // "T3 pr…"; the full label stays in the tile's tooltip below.
          const primaryCaption =
            (caption && getTimepointToken(caption.timepoint)) || `${i + 1}`;
          const label = caption !== undefined
            ? caption.fullLabel
            : `Image ${i + 1}`;
          return (
            <button
              tabIndex={0}
              key={id}
              className={cx(classes.tab_item, {
                [classes.tab_item__active]: isActiveTab,
                [classes.tab_item__thumbnail]: thumbnail !== undefined,
              })}
              onClick={!isActiveTab ? this.handleTabClick(id) : undefined}
              title={label}
              aria-label={label}
              aria-pressed={isActiveTab}
            >
              {thumbnail !== undefined ? (
                <span className={classes.tab_preview}>
                  <img
                    className={classes.tab_thumbnail}
                    src={thumbnail}
                    alt=""
                    draggable={false}
                  />
                </span>
              ) : (
                <span className={classes.tab_preview}>
                  <span className={classes.tab_number}>{i + 1}</span>
                </span>
              )}
              {/* An image-less tile already shows its number inside the tile,
                  so it gets no caption underneath. */}
              {thumbnail !== undefined ? (
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
