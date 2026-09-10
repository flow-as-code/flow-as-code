/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// The mark, as coordinates, in the one place they exist in this repository.
//
// scripts/site/render.mjs imports MARK to inline it into every generated page,
// design/build-logo.mjs imports it to write the SVG and the raster assets under
// site/, and scripts/build-site.mjs checks the hand-authored site/index.html
// still carries these exact paths. There is no second copy to keep in sync.
//
// What it is: `${ }`, the reference token that is the whole point of the
// project, with the flow passing through it. References stay tokens and never
// become literal ARNs, so the token braces are the mark.
//
// It is drawn on a 16 unit grid because 16 pixels is where a favicon lives, and
// a mark designed at 64 and shrunk is mud at that size. Every edge is on an
// integer, every stroke is 2 units, and the arrowhead is the one diagonal, at
// 45 degrees. At 16, 32 and 48 pixels (1x, 2x, 3x) every stroke lands on whole
// pixels and nothing is antialiased but that one diagonal.
//
//   0 2 4 5     8    11 12 14 16
//   +-------------------------+  0
//   | ##### |            |#####|
//   | ##    |            |   ##|
//   | ##    |  ####\     |   ##|
//   |###    |  #####>    |  ###|   <- the nubs at 7..9 are the brace waists
//   | ##    |  ####/     |   ##|
//   | ##    |            |   ##|
//   | ##### |            |#####|  16
//
// Colour is deliberately not here: the pages inline it with `currentColor`, the
// icons paint it green, and the raster lockup knocks it out of a green plate.

/** The mark's coordinate system: a square, 16 units on a side. */
export const MARK_SIZE = 16;

/**
 * The four paths, in drawing order: the opening brace, the closing brace, the
 * shaft of the flow arrow, and its head. Non-overlapping, so they fill
 * identically under any fill rule.
 */
export const MARK_PATHS = [
  "M2 0h3v2H4v12h1v2H2V9H0V7h2z",
  "M14 0h-3v2h1v12h-1v2h3V9h2V7h-2z",
  "M5 7h3v2H5z",
  "M8 5l3 3-3 3z",
];

/** What the mark is, for a title element or an alt attribute. */
export const MARK_LABEL = "flow-as-code";

/**
 * The mark as an SVG fragment: `<path>` elements and nothing else, so a caller
 * decides the element, the size, the colour, and the accessible name.
 *
 * `indent` is the leading whitespace of the first line, matching how the
 * documents that embed it are formatted.
 */
export function markPaths(indent = "") {
  return MARK_PATHS.map((d) => `${indent}<path d="${d}" />`).join("\n");
}

/**
 * A complete, standalone SVG of the mark.
 *
 * `light` and `dark` are the two fills. When both are given the document
 * carries a prefers-color-scheme rule, which is what a browser applies to an
 * SVG favicon and what an SVG in an <img> follows for the reader's theme.
 */
export function markSvg({ light, dark, size = MARK_SIZE, label = MARK_LABEL }) {
  const style =
    dark === undefined
      ? ""
      : `  <style>\n    path { fill: ${light}; }\n    @media (prefers-color-scheme: dark) { path { fill: ${dark}; } }\n  </style>\n`;
  const fill = dark === undefined ? ` fill="${light}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(MARK_SIZE)} ${String(MARK_SIZE)}" width="${String(size)}" height="${String(size)}"${fill} role="img" aria-label="${label}">
  <title>${label}</title>
${style}${markPaths("  ")}
</svg>
`;
}
