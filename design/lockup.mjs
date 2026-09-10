/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// The lockup: where the mark sits next to the wordmark, in one place.
//
// design/build-logo.mjs writes the SVGs from this, and design/raster.html draws
// the PNGs from it in a canvas. Both import this module, so the arrangement is
// computed once rather than eyeballed twice.
//
// The rules the numbers come from:
//
//   - the mark is as tall as the wordmark's ascenders and sits on the same
//     baseline, so the two read as one object rather than as an icon beside
//     some text;
//   - the gap is half the mark, measured to the wordmark's ink and not to
//     its sidebearing, because the eye measures the space it can see;
//   - the box is the ink and nothing else. Whitespace around a logo is the
//     business of whoever places it, and a logo file with padding baked in is
//     one that can never be set tight.

import { MARK_SIZE } from "./mark.mjs";
import { WORDMARK_ADVANCE, WORDMARK_INK } from "./wordmark.mjs";

/** The gap between mark and wordmark, as a fraction of the mark's height. */
const GAP = 0.5;

/**
 * The lockup laid out at a given wordmark em, in a box whose origin is the top
 * left of the ink.
 *
 * `markScale` and `markX` place the 16 unit mark; `wordX` and `baseline` place
 * the wordmark's path, which is drawn from x = 0 on the baseline y = 0.
 */
export function lockup(em = 100) {
  const unit = em / 100;
  const ink = {
    left: WORDMARK_INK.left * unit,
    right: WORDMARK_INK.right * unit,
    top: WORDMARK_INK.top * unit,
    bottom: WORDMARK_INK.bottom * unit,
  };
  const markHeight = ink.top;
  const gap = markHeight * GAP;
  const wordX = markHeight + gap - ink.left;
  return {
    width: round(markHeight + gap + (ink.right - ink.left)),
    height: round(ink.top + ink.bottom),
    markScale: round(markHeight / MARK_SIZE),
    markX: 0,
    markY: 0,
    markHeight: round(markHeight),
    wordX: round(wordX),
    baseline: round(ink.top),
    advance: WORDMARK_ADVANCE * unit,
  };
}

/** Two decimals, without the trailing zeros a logo file does not need. */
function round(value) {
  return Number(value.toFixed(2));
}
