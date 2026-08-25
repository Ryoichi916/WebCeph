/// <reference types="react" />

// `@types/material-ui`'s `Menus.MenuProps` omits `onMenuItemFocusChange`, even
// though mui 0.20's `Menu` component reads and calls it — see
// `node_modules/material-ui/Menu/Menu.js`'s propTypes ("Callback function
// fired when the focus on a MenuItem is changed") and its constructor /
// `componentWillReceiveProps` / `setFocusIndex`. `TracingToolbar`'s analysis
// switcher needs exactly that callback to track which item the keyboard has
// landed on, because mui's own `Menu` moves the focus pill on the arrow keys
// but never wires Enter or Space to anything (`MenuItem` renders on a plain
// `<span>`, not a native `<button>`, so there is no element for the browser
// to auto-activate on a keypress) — see `TracingToolbar/index.tsx`'s
// `handleAnalysisMenuKeyDown`.
//
// Declaration merging, not a rewrite: this adds one optional member to the
// upstream `MenuProps` interface without touching `node_modules`.
declare namespace __MaterialUI.Menus {
  interface MenuProps {
    onMenuItemFocusChange?(
      event: React.SyntheticEvent<{}> | null,
      newFocusIndex: number,
    ): void;
  }
}
