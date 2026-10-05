/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Display width of a line, as Prettier measures it when it decides whether a
// line fits the print width. Codegen used `String.length` (UTF-16 code units),
// which agrees with Prettier on ASCII and disagrees on CJK, Hangul and
// fullwidth text (two columns each), combining marks (none) and emoji, so a
// prompt in Japanese was not a Prettier fixed point. This is a port of
// Prettier 3's `getStringWidth` (src/utilities/get-string-width.js, MIT),
// with its East Asian Width tables from `get-east-asian-width` (MIT) copied
// as data, and its emoji regex approximated by Unicode's own
// Extended_Pictographic property; src/width.test.ts holds the two equal over
// a corpus of the scripts a Connect prompt carries.

const NOT_ASCII = /[^\x20-\x7F]/;

/** East_Asian_Width=F, as [start, end] pairs flattened. */
const FULLWIDTH_RANGES = [12288, 12288, 65281, 65376, 65504, 65510];

/** East_Asian_Width=W, as [start, end] pairs flattened. */
const WIDE_RANGES = [
  4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749,
  9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918,
  9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981,
  9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071,
  10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929,
  11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591,
  12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388,
  44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180,
  94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587,
  110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951,
  110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374,
  127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589,
  127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955,
  127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317,
  128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591,
  128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748,
  128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535,
  129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770,
  129775, 129784, 131072, 196605, 196608, 262141,
];

function inRanges(ranges: readonly number[], codePoint: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = ranges[mid * 2]!;
    const end = ranges[mid * 2 + 1]!;
    if (codePoint < start) hi = mid - 1;
    else if (codePoint > end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * An emoji cluster as Prettier's emoji regex consumes it: a keycap, a pair of
 * regional indicators, or a pictograph with its presentation selector or skin
 * tone, joined to more of the same by ZWJ. Two columns, except the pictographs
 * Prettier's `narrow-emojis` list says terminals draw at one.
 */
const EMOJI =
  /[#*0-9]️?⃣|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/gu;

/** Prettier's `narrow-emojis`: pictographs drawn one column wide. */
const NARROW_EMOJI =
  /^(?:[\xA9\xAE‼⁉™ℹ↔-↙↩↪⌨⏏⏭-⏯⏱⏲⏸-⏺Ⓜ▪▫▶◀◻◼☀-☄☎☑☘☠☢☣☦☪☮☯☸-☺♀♂♟♠♣♥♦♨♻♾⚒⚔-⚗⚙⚛⚜⚠⚧⚰⚱⛈⛏⛑⛓⛩⛰⛱⛴⛷⛸✂✈✉✏✒✔✖✝✡✳✴❄❇❣❤➡⤴⤵⬅-⬇]|\uD83C[\uDD70\uDD71\uDD7E\uDD7F\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF3\uDFF5\uDFF7]|\uD83D[\uDC3F\uDC41\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3])$/;

/**
 * The columns a string takes on a line, as Prettier counts them: ASCII one
 * each; control characters, combining marks (U+0300 to U+036F) and variation
 * selectors (U+FE00 to U+FE0F) none; East Asian wide and fullwidth characters
 * two; an emoji cluster two, or one for the narrow pictographs.
 */
export function displayWidth(text: string): number {
  if (text === "") return 0;
  if (!NOT_ASCII.test(text)) return text.length;
  let width = 0;
  const rest = text.replace(EMOJI, (cluster) => {
    width += NARROW_EMOJI.test(cluster) ? 1 : 2;
    return "";
  });
  for (const character of rest) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) continue;
    if (codePoint >= 768 && codePoint <= 879) continue;
    if (codePoint >= 65024 && codePoint <= 65039) continue;
    width += inRanges(FULLWIDTH_RANGES, codePoint) || inRanges(WIDE_RANGES, codePoint) ? 2 : 1;
  }
  return width;
}
