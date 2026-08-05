import * as React from 'react';
import Props from './props';

import map from 'lodash/map';

import * as cx from 'classnames';

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
          return (
            <button
              tabIndex={0}
              key={id}
              className={cx(classes.tab_item, { [classes.tab_item__active]: isActiveTab })}
              onClick={!isActiveTab ? this.handleTabClick(id) : undefined}
              title={`Workspace ${i + 1}`}
              aria-label={`Workspace ${i + 1}`}
              aria-pressed={isActiveTab}
            >
              {i + 1}
            </button>
          );
        })}
        { this.props.canAddWorkspace ? (
          <button
            className={classes.tab_item_placeholder}
            onClick={this.handleNewTab}
            title="New workspace"
            aria-label="New workspace"
          >
            +
          </button>
        ) : null}
      </div>
    );
  }
}

export default VerticalTabBar;
