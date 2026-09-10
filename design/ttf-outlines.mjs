/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// A TrueType glyph reader, small enough to read, with no dependencies.
//
// Why it exists: the wordmark is set in a real typeface and shipped as
// outlines, because an SVG <text> element renders in whatever font the viewer
// happens to have and a logo that changes shape per viewer is not a logo. To
// ship outlines something has to turn glyphs into path data, and the choice was
// between adding a font library to a repository that has no image dependency
// anywhere in it, or reading the three tables that answer the question. This is
// the three tables: cmap (character to glyph), loca (glyph to offset), glyf
// (the contours). Nothing here is a general font engine: no hinting, no
// kerning, no variable-font axes, no colour. It is enough for the twelve
// letters in the wordmark, and it fails loudly rather than silently on anything
// it does not model.
//
// Format reference: the OpenType spec, chapters on the tables named above.
// https://learn.microsoft.com/en-us/typography/opentype/spec/otff
// https://learn.microsoft.com/en-us/typography/opentype/spec/glyf
// https://learn.microsoft.com/en-us/typography/opentype/spec/cmap
//
// Contours are quadratic B-splines with implied on-curve points between two
// consecutive off-curve points, which is the one part of the format that is
// easy to get subtly wrong; `contourToPath` below is where that is handled.

/** The sfnt table directory: tag to { offset, length }. */
function tables(buf) {
  const found = new Map();
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    found.set(buf.toString("ascii", at, at + 4), {
      offset: buf.readUInt32BE(at + 8),
      length: buf.readUInt32BE(at + 12),
    });
  }
  return found;
}

/** cmap subtable format 4 as a code point to glyph id map. */
function readCmap(buf, cmapOffset) {
  const numSubtables = buf.readUInt16BE(cmapOffset + 2);
  let best = -1;
  for (let i = 0; i < numSubtables; i += 1) {
    const at = cmapOffset + 4 + i * 8;
    const platform = buf.readUInt16BE(at);
    const encoding = buf.readUInt16BE(at + 2);
    const offset = cmapOffset + buf.readUInt32BE(at + 4);
    // Windows BMP (3,1) is the one every desktop font has; Unicode (0,3) is
    // the same table under the other platform id.
    const wanted = (platform === 3 && encoding === 1) || (platform === 0 && encoding === 3);
    if (wanted && buf.readUInt16BE(offset) === 4) best = offset;
  }
  if (best === -1) throw new Error("no format 4 cmap subtable (platform 3/1 or 0/3)");

  const segCount = buf.readUInt16BE(best + 6) / 2;
  const ends = best + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const ranges = deltas + segCount * 2;

  const map = new Map();
  for (let seg = 0; seg < segCount; seg += 1) {
    const end = buf.readUInt16BE(ends + seg * 2);
    const start = buf.readUInt16BE(starts + seg * 2);
    const delta = buf.readInt16BE(deltas + seg * 2);
    const rangeOffset = buf.readUInt16BE(ranges + seg * 2);
    if (start === 0xffff) continue;
    for (let code = start; code <= end; code += 1) {
      let glyph;
      if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
      else {
        const at = ranges + seg * 2 + rangeOffset + (code - start) * 2;
        glyph = buf.readUInt16BE(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) map.set(code, glyph);
    }
  }
  return map;
}

/** One glyph's contours, in font units, y up. */
function readGlyph(buf, glyf, loca, id) {
  const [from, to] = [loca[id], loca[id + 1]];
  if (from === to) return []; // an empty glyph, such as a space
  const at = glyf + from;
  const numContours = buf.readInt16BE(at);
  if (numContours < 0) {
    // A composite glyph is an accented letter or a ligature. The wordmark has
    // neither, and guessing at one would be worse than saying so.
    throw new Error(`glyph ${String(id)} is composite, which this reader does not model`);
  }

  const endPts = [];
  for (let i = 0; i < numContours; i += 1) endPts.push(buf.readUInt16BE(at + 10 + i * 2));
  const numPoints = numContours === 0 ? 0 : endPts[endPts.length - 1] + 1;

  let cursor = at + 10 + numContours * 2;
  cursor += 2 + buf.readUInt16BE(cursor); // instructions, skipped

  const flags = [];
  while (flags.length < numPoints) {
    const flag = buf.readUInt8(cursor);
    cursor += 1;
    flags.push(flag);
    if (flag & 0x08) {
      const repeat = buf.readUInt8(cursor);
      cursor += 1;
      for (let i = 0; i < repeat; i += 1) flags.push(flag);
    }
  }

  const readAxis = (shortBit, sameBit) => {
    const values = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & shortBit) {
        const delta = buf.readUInt8(cursor);
        cursor += 1;
        value += flag & sameBit ? delta : -delta;
      } else if (!(flag & sameBit)) {
        value += buf.readInt16BE(cursor);
        cursor += 2;
      }
      values.push(value);
    }
    return values;
  };
  const xs = readAxis(0x02, 0x10);
  const ys = readAxis(0x04, 0x20);

  const contours = [];
  let start = 0;
  for (const end of endPts) {
    const points = [];
    for (let i = start; i <= end; i += 1) {
      points.push({ x: xs[i], y: ys[i], on: (flags[i] & 0x01) !== 0 });
    }
    contours.push(points);
    start = end + 1;
  }
  return contours;
}

/**
 * One contour as SVG path commands, given a font-unit to user-unit transform.
 *
 * TrueType stores quadratic splines where two consecutive off-curve points
 * imply an on-curve point at their midpoint, and a contour may begin off-curve.
 * Both cases are normalized here before anything is emitted, so the command
 * loop below has one shape: on-curve points are line-tos and each off-curve
 * point is the control of a quadratic to the next on-curve point.
 */
function contourToPath(points, place) {
  if (points.length === 0) return "";

  const expanded = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const next = points[(i + 1) % points.length];
    expanded.push(point);
    if (!point.on && !next.on) {
      expanded.push({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2, on: true });
    }
  }

  let rotated = expanded;
  if (!expanded[0].on) {
    const firstOn = expanded.findIndex((p) => p.on);
    if (firstOn === -1) throw new Error("a contour with no on-curve point");
    rotated = [...expanded.slice(firstOn), ...expanded.slice(0, firstOn)];
  }

  const parts = [`M${place(rotated[0])}`];
  for (let i = 1; i < rotated.length; i += 1) {
    const point = rotated[i];
    if (point.on) parts.push(`L${place(point)}`);
    else {
      const end = rotated[i + 1] ?? rotated[0];
      parts.push(`Q${place(point)} ${place(end)}`);
      i += 1;
    }
  }
  parts.push("Z");
  return parts.join("");
}

/** Reads the tables the outlines need out of a TrueType file. */
export function readFont(buf) {
  const dir = tables(buf);
  const need = (tag) => {
    const table = dir.get(tag);
    if (table === undefined) throw new Error(`the font has no ${tag} table`);
    return table.offset;
  };

  const head = need("head");
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const longLoca = buf.readInt16BE(head + 50) === 1;
  const numGlyphs = buf.readUInt16BE(need("maxp") + 4);

  const locaAt = need("loca");
  const loca = [];
  for (let i = 0; i <= numGlyphs; i += 1) {
    loca.push(longLoca ? buf.readUInt32BE(locaAt + i * 4) : buf.readUInt16BE(locaAt + i * 2) * 2);
  }

  const hheaAt = need("hhea");
  const numberOfHMetrics = buf.readUInt16BE(hheaAt + 34);
  const hmtxAt = need("hmtx");
  const advance = (id) =>
    buf.readUInt16BE(hmtxAt + Math.min(id, numberOfHMetrics - 1) * 4) / unitsPerEm;

  const os2 = dir.get("OS/2");
  const capHeight =
    os2 !== undefined && buf.readUInt16BE(os2.offset) >= 2
      ? buf.readInt16BE(os2.offset + 88) / unitsPerEm
      : 0.7;

  const cmap = readCmap(buf, need("cmap"));
  const glyf = need("glyf");

  return { unitsPerEm, capHeight, advance, cmap, glyf, loca, buf };
}

/**
 * The bounding box of path data in the subset this module emits: absolute M, L,
 * Q and Z, coordinates separated by spaces. Quadratics are sampled rather than
 * hulled, because a control point of a round letter sits outside the curve and
 * a bounding box drawn around the controls is visibly too tall.
 */
export function pathBounds(d) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const see = (x, y) => {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  };
  let current = [0, 0];
  for (const [, command, args] of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const numbers =
      args.trim() === ""
        ? []
        : args
            .trim()
            .split(/[\s,]+/)
            .map(Number);
    if (command === "M" || command === "L") {
      see(numbers[0], numbers[1]);
      current = [numbers[0], numbers[1]];
    } else if (command === "Q") {
      const [cx, cy, x, y] = numbers;
      for (let step = 0; step <= 16; step += 1) {
        const t = step / 16;
        const u = 1 - t;
        see(
          u * u * current[0] + 2 * u * t * cx + t * t * x,
          u * u * current[1] + 2 * u * t * cy + t * t * y,
        );
      }
      current = [x, y];
    }
  }
  return box;
}

/**
 * A string as one SVG path, laid out on the baseline at (x, y) with the em set
 * to `size` user units. Advance widths only: no kerning and no shaping, which
 * is exactly right for a monospaced face and wrong for a proportional one.
 *
 * Returns the path data and the pen position the string ended at.
 */
export function textToPath(font, text, { size, x = 0, y = 0, decimals = 2 }) {
  const round = (value) => {
    const fixed = value.toFixed(decimals);
    return String(Number(fixed));
  };
  const parts = [];
  let pen = x;
  for (const character of text) {
    const id = font.cmap.get(character.codePointAt(0));
    if (id === undefined) throw new Error(`the font has no glyph for ${JSON.stringify(character)}`);
    const scale = size / font.unitsPerEm;
    const place = (point) => `${round(pen + point.x * scale)} ${round(y - point.y * scale)}`;
    for (const contour of readGlyph(font.buf, font.glyf, font.loca, id)) {
      parts.push(contourToPath(contour, place));
    }
    pen += font.advance(id) * size;
  }
  return { d: parts.join(""), width: pen - x };
}
