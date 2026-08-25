/**
 * Elements a keyboard user can land focus on, in DOM (tab) order.
 *
 * `offsetParent !== null` excludes anything `display: none`-d or otherwise
 * removed from layout (a hidden tab panel, a collapsed section) without
 * needing to inspect every element's computed style.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.prototype.slice
    .call(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el: HTMLElement) => el.offsetParent !== null);

/**
 * Traps Tab/Shift+Tab keyboard focus inside `container` — a modal dialog's
 * root element — per the WAI-ARIA APG "inert background" pattern.
 *
 * Without this, mui 0.20's `Dialog` (and this app's own hand-rolled dialogs)
 * do nothing to stop Tab from walking focus out through the *app's* own DOM
 * order and onto controls that sit, unclickable, behind the dialog's overlay
 * — confirmed live: from the Analysis Summary dialog, five more Tabs landed
 * on the toolbar's "Report" button, still sitting behind the (visibly open)
 * dialog, and Enter on it silently replaced the whole Summary view with the
 * Clinical Report — an action a mouse user cannot take, since the overlay
 * genuinely blocks pointer clicks on that same button. A keyboard user was
 * not so protected, because native `Enter` activation on a focused element
 * bypasses the overlay's hit-testing entirely.
 *
 * Moves focus onto the dialog's first focusable element immediately (unless
 * something inside it already has focus — an `autoFocus` field beats this
 * to it, and re-stealing focus on every call would undo that), and restores
 * focus to whatever had it before the trap was installed once `release()` is
 * called — the standard round trip for a modal that must give control back
 * to the exact place the keyboard user left it.
 */
export const trapFocus = (container: HTMLElement): (() => void) => {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  if (!container.contains(document.activeElement)) {
    const focusable = getFocusableElements(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      container.focus();
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' && e.keyCode !== 9) {
      return;
    }
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  // Capture phase: the trap must see Tab before anything inside the dialog
  // (or, since Dialog's overlay does not stop bubbling to `document`, before
  // any document-level handler outside it) has a chance to act on it first.
  document.addEventListener('keydown', handleKeyDown, true);

  return () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    if (
      previouslyFocused !== null &&
      typeof previouslyFocused.focus === 'function' &&
      document.body.contains(previouslyFocused)
    ) {
      previouslyFocused.focus();
    }
  };
};
