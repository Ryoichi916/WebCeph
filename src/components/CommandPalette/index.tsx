import * as React from 'react';
import Props from './props';
import { PaletteCommand } from './commands';
import { filterCommands } from './search';

const classes = require('./style.scss');

type State = {
  query: string;
  selectedIndex: number;
};

const LISTBOX_ID = 'command-palette-listbox';
const getOptionId = (index: number) => `command-palette-option-${index}`;

/**
 * A Ctrl+K / Cmd+K overlay (bound in `App/shortcuts.ts`) that finds and runs
 * an app command by name.
 *
 * It renders nothing at all while closed — `isOpen` comes from
 * `commandPalette.isOpen` in the store, flipped by the shortcut and by
 * `Escape`/backdrop/selecting a command here. While open it is a
 * `role="dialog"` with a `role="combobox"` search field over a
 * `role="listbox"` of matches (the WAI-ARIA APG combobox pattern): the input
 * keeps DOM focus at all times and tracks the arrow-key-highlighted option
 * through `aria-activedescendant`, rather than moving focus onto each option
 * as it is highlighted. Tab-trapping and focus restore on close are not
 * reimplemented here — mounting with `role="dialog" aria-modal="true"` is all
 * any dialog in this app needs to opt into `DialogFocusGuard`, which already
 * does both for whichever dialog is currently in the DOM.
 */
class CommandPalette extends React.PureComponent<Props, State> {
  state: State = {
    query: '',
    selectedIndex: 0,
  };

  componentDidUpdate(prevProps: Props) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Every opening starts a fresh search, not wherever the last one left off.
      this.setState({ query: '', selectedIndex: 0 });
    }
  }

  render() {
    if (!this.props.isOpen) {
      return null;
    }
    const { className } = this.props;
    const { query, selectedIndex } = this.state;
    const results = this.getFilteredCommands();
    const activeIndex = results.length === 0 ? -1 : Math.min(selectedIndex, results.length - 1);
    return (
      <div
        className={[classes.overlay, className].filter(Boolean).join(' ')}
        onMouseDown={this.handleOverlayMouseDown}
      >
        <div
          className={classes.dialog}
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
        >
          <input
            type="text"
            className={classes.input}
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex === -1 ? undefined : getOptionId(activeIndex)}
            placeholder="Type a command…"
            value={query}
            onChange={this.handleQueryChange}
            onKeyDown={this.handleKeyDown}
          />
          {results.length === 0 ? (
            <p className={classes.empty}>No matching commands</p>
          ) : (
            <ul className={classes.list} role="listbox" id={LISTBOX_ID}>
              {results.map((command, index) => (
                <li
                  key={command.id}
                  id={getOptionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? classes.option_active : classes.option}
                  onMouseEnter={this.handleOptionHover(index)}
                  onClick={this.handleOptionClick(command)}
                >
                  {command.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  private getFilteredCommands(): PaletteCommand[] {
    return filterCommands(this.props.commands, this.state.query);
  }

  private handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: e.target.value, selectedIndex: 0 });
  }

  private handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const results = this.getFilteredCommands();
    if (results.length === 0 && e.key !== 'Escape') {
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.setState(({ selectedIndex }) => ({
          selectedIndex: (selectedIndex + 1) % results.length,
        }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.setState(({ selectedIndex }) => ({
          selectedIndex: (selectedIndex - 1 + results.length) % results.length,
        }));
        break;
      case 'Enter': {
        e.preventDefault();
        const command = results[Math.min(this.state.selectedIndex, results.length - 1)];
        if (command !== undefined) {
          this.props.onExecute(command);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        this.props.onClose();
        break;
      default:
        break;
    }
  }

  private handleOptionHover = (index: number) => () => {
    this.setState({ selectedIndex: index });
  }

  private handleOptionClick = (command: PaletteCommand) => () => {
    this.props.onExecute(command);
  }

  private handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only the backdrop itself closes the palette — a mousedown that started
    // inside the dialog (selecting text in the input, say) must not count as
    // "outside".
    if (e.target === e.currentTarget) {
      this.props.onClose();
    }
  }
}

export default CommandPalette;
