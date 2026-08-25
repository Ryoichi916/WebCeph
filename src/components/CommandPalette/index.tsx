import * as React from 'react';
import Props from './props';
import { PaletteCommand } from './commands';
import { filterCommands } from './search';
import { isFromEditable } from 'components/App/shortcuts';

const classes = require('./style.scss');

type State = {
  query: string;
  selectedIndex: number;
};

const LISTBOX_ID = 'command-palette-listbox';
const getOptionId = (index: number) => `command-palette-option-${index}`;

/**
 * A Ctrl+K / Cmd+K overlay that finds and runs an app command by name.
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
 *
 * The Ctrl+K/Cmd+K binding itself lives on `document`, in this component
 * (@see `componentDidMount`), *not* in `App/shortcuts.ts`'s react-hotkeys
 * map like the rest of the app's shortcuts — see the comment above `keyMap`
 * there for why that map cannot reach this key reliably, and this component
 * can: `<CommandPalette>` is mounted once, unconditionally, at the app root
 * (`App/index.tsx`), regardless of whether a patient is active, so the
 * listener attaches on first paint and never depends on where focus happens
 * to be.
 */
class CommandPalette extends React.PureComponent<Props, State> {
  state: State = {
    query: '',
    selectedIndex: 0,
  };

  /**
   * Guards `onMouseEnter` against a hover the clinician never intended.
   *
   * The dialog renders at a fixed screen position, so if the cursor is
   * already resting over one of the option rows *before* the dialog opens
   * (e.g. clicking into the canvas near where the palette will render, then
   * pressing Ctrl+K without touching the mouse again), the browser fires a
   * real `mouseenter` on that row the instant it mounts under the stationary
   * cursor — with no mouse motion involved at all. Left unguarded, that
   * silently overrode the correct default (index 0) before any keyboard
   * input, so Enter executed whatever command happened to be under the
   * pointer rather than the top match.
   *
   * The standard fix (VS Code / Sublime-style palettes): hover-driven
   * selection is ignored until a genuine `mousemove` has been observed
   * *after* this opening. Reset on every open, flipped by a document-level
   * `mousemove` listener that only runs while open, so the very first hover
   * that follows real cursor motion re-enables the usual point-to-select
   * behaviour.
   */
  private hasMouseMoved = false;

  componentDidMount() {
    // Capture phase, same as `utils/focusTrap.ts`'s own document-level Tab
    // handling: this must see the keystroke regardless of which element (or
    // lack of one — `document.body` included) currently holds focus.
    document.addEventListener('keydown', this.handleGlobalKeyDown, true);
  }

  componentDidUpdate(prevProps: Props) {
    if (!prevProps.isOpen && this.props.isOpen) {
      // Every opening starts a fresh search, not wherever the last one left off.
      this.setState({ query: '', selectedIndex: 0 });
      this.hasMouseMoved = false;
      document.addEventListener('mousemove', this.handleDocumentMouseMove);
    } else if (prevProps.isOpen && !this.props.isOpen) {
      document.removeEventListener('mousemove', this.handleDocumentMouseMove);
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleGlobalKeyDown, true);
    document.removeEventListener('mousemove', this.handleDocumentMouseMove);
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

  /**
   * The Ctrl+K/Cmd+K toggle itself — @see the class doc comment for why this
   * is a `document` listener rather than a react-hotkeys binding.
   *
   * Gated on `hasActivePatient` the same way the palette's own command list
   * is scoped (@see `commands.ts`): every command here acts on the active
   * workspace, so there is nothing useful to open without one, and opening
   * anyway would be a dialog full of commands that do nothing yet.
   */
  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'k' && e.key !== 'K') {
      return;
    }
    if (!e.ctrlKey && !e.metaKey) {
      return;
    }
    if (this.props.isOpen || !this.props.hasActivePatient) {
      return;
    }
    if (isFromEditable(e)) {
      // Not a shortcut — a letter of what is being typed, same guard
      // `App/shortcuts.ts` applies to its own bindings.
      return;
    }
    e.preventDefault();
    this.props.onOpen();
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

  private handleDocumentMouseMove = () => {
    this.hasMouseMoved = true;
  }

  private handleOptionHover = (index: number) => () => {
    if (!this.hasMouseMoved) {
      // A `mouseenter` that fired before any real cursor motion was observed
      // since the dialog opened — the cursor was already resting on this row
      // when it mounted, not moved onto it. Not a hover the clinician made.
      return;
    }
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
