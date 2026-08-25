import * as React from 'react';

import { trapFocus } from 'utils/focusTrap';

/**
 * Traps keyboard focus inside whichever `[role="dialog"][aria-modal="true"]`
 * is currently in the document — mounted once at the app root rather than
 * wired into every dialog-owning component individually.
 *
 * mui 0.20's `Dialog` renders its content through `RenderToLayer`, a portal
 * that appends straight to `document.body` outside the React tree a
 * component's own `ref` can see, so a per-dialog `componentDidMount` cannot
 * reach the actual dialog DOM node without fighting that. A `MutationObserver`
 * on `document.body` sees it regardless of where in the DOM it landed, and
 * lets every dialog in the app opt in with the same two attributes
 * (`role="dialog"`, `aria-modal="true"`) it already needs for a screen reader
 * to announce it as one, instead of each also wiring its own focus-trap
 * lifecycle.
 *
 * Only one modal is ever open at a time in this app, so the trap simply
 * tracks the current `[role="dialog"]` element: a new one appearing (a
 * dialog opening, or a modal opening a further modal on top) traps to that
 * one instead; the tracked one disappearing (closing) releases the trap
 * and restores focus to whatever opened it.
 */
export default class DialogFocusGuard extends React.PureComponent<{}, {}> {
  private observer: MutationObserver | null = null;
  private trapped: HTMLElement | null = null;
  private release: (() => void) | null = null;

  componentDidMount() {
    this.observer = new MutationObserver(this.check);
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.check();
  }

  componentWillUnmount() {
    if (this.observer !== null) {
      this.observer.disconnect();
    }
    this.releaseTrap();
  }

  render() {
    return null;
  }

  private check = () => {
    const dialogs = document.body.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    );
    const current = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
    if (current === this.trapped) {
      return;
    }
    this.releaseTrap();
    if (current !== null) {
      this.trapped = current;
      this.release = trapFocus(current);
    }
  }

  private releaseTrap() {
    if (this.release !== null) {
      this.release();
      this.release = null;
    }
    this.trapped = null;
  }
}
