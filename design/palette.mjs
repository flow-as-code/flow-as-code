/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// The colours the logo files are drawn in.
//
// These are the landing page's own custom properties, repeated here because a
// PNG cannot read a stylesheet. site/index.html and scripts/site/render.mjs are
// where they live for the pages; if one moves, move both.
//
// `ICON` is the one value that is not on the page. A favicon.ico carries no
// media query and no alpha trick that would let it follow the reader's theme,
// so it is painted in a green that clears 3:1 against a white tab strip (4.3:1)
// and against Chrome's dark one (3.8:1). The site accent itself is too dark for
// the second and the dark-theme mint is far too light for the first.

export const PALETTE = {
  /** Body ink, light theme and dark theme. */
  INK: "#16181d",
  INK_DARK: "#e9e7e1",
  /** The accent, light theme and dark theme. */
  ACCENT: "#1f5f4b",
  ACCENT_DARK: "#6ee7b7",
  /** favicon.ico, which has to survive both tab strips as one colour. */
  ICON: "#2e8b6b",
  /** Page background, light theme and dark theme. */
  BG: "#fbfaf7",
  BG_DARK: "#101216",
  /** Secondary text and hairlines, light theme. */
  MUTED: "#5a6070",
  RULE: "#e3e0d8",
};
