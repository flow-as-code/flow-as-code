/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The viewport's CSS width, kept current across resizes.
//
// A VIEWPORT measurement, not a device test. A phone and a half-width window
// on a laptop are the same problem to a three-column layout, and "is this a
// touch device" answers a different question: a tablet in landscape has the
// width, a desktop browser dragged narrow does not. Reading innerWidth on the
// resize event covers both and needs no reload to change its mind.

import { useEffect, useState } from "react";

/**
 * Below this many CSS pixels the studio shell stops working, measured rather
 * than picked (docs/05-hosted-demo.md).
 *
 * The shell is three columns and the outer two do not shrink: the palette
 * column is w-52 and the inspector is w-72, which with their borders take a
 * fixed 496px whatever the viewport is. Measured in Chrome on the built demo,
 * the canvas gets viewport minus 496: 200px at a 696px viewport, 140px at
 * 636px, 60px at 556px, and exactly 0 at 496px, where it has disappeared. One
 * block node is w-45, 180px. So 676px is the width below which the canvas
 * cannot show a single whole block, and 700 is that number with enough margin
 * left for the node to have air on both sides. Above it the layout is tight
 * but honest; below it there is nothing to look at.
 */
export const NARROW_MAX_PX = 700;

function currentWidth(): number {
  return typeof window === "undefined" ? NARROW_MAX_PX : window.innerWidth;
}

/** The viewport width in CSS pixels, re-read on every resize. */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(currentWidth);

  useEffect(() => {
    const measure = () => setWidth(currentWidth());
    // Once on mount: the first paint may follow a resize that happened while
    // the bundle was still loading.
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return width;
}
