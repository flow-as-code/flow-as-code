/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// displayWidth is a port of Prettier's getStringWidth; Prettier exposes the
// original as prettier.util.getStringWidth, which is the oracle here. Prettier
// is a dev dependency only, so the comparison lives in a test and core carries
// its own measure at run time.

import { describe, expect, it } from "vitest";

import { displayWidth } from "./width.js";

const CORPUS = [
  "",
  "plain ascii, 100 columns or so",
  "漢字の説明文です",
  "한국어 안내 메시지",
  "ＦＵＬＬＷＩＤＴＨ１２３",
  "café résumé naïve",
  "café résumé",
  "a​b‌c‍d",
  "emoji 😀 and ✅ and ™ and © and ❤️ and 👍🏽 and 👨‍👩‍👧 and 🇯🇵 and 1️⃣",
  "mixed 日本語 and english と 😀",
  "tab\tand\u0007bell",
  "ひらがな、カタカナ。句読点！？",
  "\u{20000}\u{2A6DD}",
  "Ｔｅｓｔ（全角）",
  "ẞ ß ſ ﬁ",
];

describe("displayWidth", () => {
  it("counts as Prettier's getStringWidth does over the corpus", async () => {
    const prettier = (await import("prettier")) as unknown as {
      util: { getStringWidth(text: string): number };
    };
    for (const text of CORPUS) {
      expect(displayWidth(text), JSON.stringify(text)).toBe(prettier.util.getStringWidth(text));
    }
  });

  it("gives the widths the rules describe", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("漢")).toBe(2);
    expect(displayWidth("한")).toBe(2);
    expect(displayWidth("Ａ")).toBe(2);
    expect(displayWidth("é")).toBe(1);
    expect(displayWidth("😀")).toBe(2);
    expect(displayWidth("™")).toBe(1);
    expect(displayWidth("\u0007")).toBe(0);
  });
});
