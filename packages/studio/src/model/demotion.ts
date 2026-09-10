/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The demotion oracle: which Actions would codegen emit as `new GenericBlock`?
//
// Why this module exists. @flow-as-code/core's codegen inverts every Action back into a
// typed builder block and, when the Action's shape does not match the block
// class exactly, falls back to GenericBlock (codegen.ts, invertAction). That
// fallback is right for genuinely unmodeled actions. It is a silent data loss
// when a canvas gesture turns a block codegen COULD invert into one it cannot:
// the user loses typed authoring for that block, lint says nothing, the schema
// says nothing, and assertSaveable says nothing.
//
// The studio used to answer "is this generic?" with isModeled(action.Type)
// while codegen answered it with "did the inverter succeed?". The two
// disagreed, and every hole found in review lived in that gap. So this module
// does not reimplement the inverter rules; duplicating them in capabilities.ts
// is exactly how the holes appeared. It runs the real codegen and reads back
// which ids came out generic. codegen is pure and deterministic, so it is a
// sound oracle, and it can never drift from itself.
//
// The parse is deliberately strict. A shape it cannot account for throws
// rather than silently returning an empty set, because an oracle that quietly
// answers "nothing is demoted" turns the mutation guard vacuous.

import type { FlowDoc } from "@flow-as-code/core";
import { codegen } from "@flow-as-code/core";

/** The construction codegen emits for an Action it cannot invert. */
const MARKER = "new GenericBlock(";

/** Escapes @flow-as-code/core's quoteString can produce (codegen.ts). */
const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  r: "\r",
  t: "\t",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

interface StringLiteral {
  value: string;
  /** Index just past the closing quote. */
  end: number;
}

/**
 * Reads the JS string literal starting at `at` (which must be a quote), or
 * undefined when the literal is unterminated. Handles the escapes codegen
 * writes: \\, \", \', \n, \r, \t, and \uXXXX.
 */
function readString(source: string, at: number): StringLiteral | undefined {
  const quote = source[at];
  if (quote !== '"' && quote !== "'") return undefined;
  let out = "";
  for (let i = at + 1; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      const next = source[i + 1];
      if (next === undefined) return undefined;
      if (next === "u") {
        const hex = source.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return undefined;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 5;
        continue;
      }
      const decoded = SHORT_ESCAPES[next];
      if (decoded === undefined) return undefined;
      out += decoded;
      i += 1;
      continue;
    }
    if (ch === quote) return { value: out, end: i + 1 };
    out += ch;
  }
  return undefined;
}

/** Index of the first character at or after `at` that is not whitespace. */
function skipSpace(source: string, at: number): number {
  let i = at;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  return i;
}

/**
 * Reads the `id` of a GenericBlock config that starts at `at` (just past
 * MARKER). codegen always emits `id` first, inline or broken across lines
 * (invertGeneric, printBrokenObject), so the shape is `{ id: <string> `.
 */
function readConfigId(source: string, at: number): string | undefined {
  let i = skipSpace(source, at);
  if (source[i] !== "{") return undefined;
  i = skipSpace(source, i + 1);
  if (!source.startsWith("id", i)) return undefined;
  i = skipSpace(source, i + 2);
  if (source[i] !== ":") return undefined;
  i = skipSpace(source, i + 1);
  return readString(source, i)?.value;
}

/**
 * Every GenericBlock id in generated source. Walks the text skipping string
 * literals and comments, so a parameter whose value happens to contain the
 * text "new GenericBlock({ id: ..." cannot forge an entry.
 */
function scanGenericIds(source: string): Set<string> {
  const ids = new Set<string>();
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '"' || ch === "'") {
      const literal = readString(source, i);
      // An unterminated literal means the text is not the code we think it is.
      if (literal === undefined) {
        throw new Error("Generated source has an unterminated string literal.");
      }
      i = literal.end;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl < 0 ? source.length : nl + 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (ch === "n" && source.startsWith(MARKER, i)) {
      const id = readConfigId(source, i + MARKER.length);
      if (id === undefined) {
        throw new Error(
          "Cannot read the id of a GenericBlock in generated source; codegen's output shape changed.",
        );
      }
      ids.add(id);
      i += MARKER.length;
      continue;
    }
    i++;
  }
  return ids;
}

/**
 * True when the generated import list names GenericBlock. codegen imports
 * exactly the block classes it constructs, so this is an independent second
 * reading of the same fact and cross-checks the scan above.
 */
function importsGenericBlock(source: string): boolean {
  const start = source.indexOf("import {");
  if (start < 0) throw new Error("Generated source has no import statement.");
  const end = source.indexOf(";", start);
  if (end < 0) throw new Error("Generated source has an unterminated import statement.");
  return /(^|[\s,{])GenericBlock([\s,}]|$)/.test(source.slice(start, end));
}

export type DemotionProbe =
  { generated: true; ids: ReadonlySet<string> } | { generated: false; error: string };

// codegen is pure, so a probe is a property of the doc VALUE. Mutations return
// fresh objects, so identity is a sound cache key and the previous doc in a
// mutation chain is probed once, not once per gesture.
const cache = new WeakMap<FlowDoc, DemotionProbe>();

/**
 * Runs codegen over the doc and reports which Action Identifiers it emitted as
 * GenericBlock. Never throws for a doc codegen itself rejects (an empty flow,
 * a module/connectType mismatch); that is reported as generated: false so
 * callers can tell "no demotions" apart from "no answer".
 */
export function probeDemotion(doc: FlowDoc): DemotionProbe {
  const hit = cache.get(doc);
  if (hit !== undefined) return hit;

  let probe: DemotionProbe;
  try {
    // Layout is irrelevant to which blocks invert, and codegen runs a full
    // dagre pass whenever `layout` is present in order to decide whether the
    // positions are a derivable default. Dropping it makes the probe roughly
    // an order of magnitude cheaper on large flows: it runs on every guarded
    // mutation, so a canvas drag on a 100-action flow was paying about 690ms
    // of graph layout per frame for an answer that does not depend on it.
    const { layout: _layout, ...withoutLayout } = doc;
    const source = codegen(withoutLayout as FlowDoc);
    const ids = scanGenericIds(source);
    // Two consistency checks. Either failing means the oracle misread the
    // output, and a misreading oracle must fail loudly, not answer "clean".
    if (importsGenericBlock(source) !== ids.size > 0) {
      throw new Error(
        `Generated source imports ${importsGenericBlock(source) ? "" : "no "}GenericBlock but ${String(ids.size)} were parsed.`,
      );
    }
    const known = new Set(doc.content.Actions.map((a) => a.Identifier));
    for (const id of ids) {
      if (!known.has(id)) {
        throw new Error(`Parsed GenericBlock id "${id}" is not an Action in this document.`);
      }
    }
    probe = { generated: true, ids };
  } catch (err) {
    probe = { generated: false, error: err instanceof Error ? err.message : String(err) };
  }
  cache.set(doc, probe);
  return probe;
}

/**
 * The Identifiers codegen would emit as GenericBlock. Empty when codegen
 * cannot run at all; use probeDemotion when that distinction matters.
 */
export function demotedIds(doc: FlowDoc): ReadonlySet<string> {
  const probe = probeDemotion(doc);
  return probe.generated ? probe.ids : new Set<string>();
}

export interface DemotionDelta {
  /** Ids that existed before and lost their typed block through the change. */
  demoted: string[];
  /** Set when the change made the doc ungeneratable outright. */
  ungeneratable?: string;
  /**
   * Set when the oracle could not answer at all. The caller MUST treat this as
   * a refusal: an unanswerable probe is not the same as "nothing was demoted",
   * and conflating the two is what made an earlier version of this invariant
   * silently inactive on documents codegen could not process.
   */
  unverifiable?: string;
}

/**
 * What a change costs. Only Identifiers that EXISTED in `before` count: a
 * block the gesture just created cannot have lost anything, and a freshly
 * inserted MessageParticipant is legitimately inexpressible until it is wired,
 * which lint (terminal-blocks, error-branches) is what guides the user to fix.
 * Blocks the user already had are the ones the invariant protects.
 */
export function demotionDelta(before: FlowDoc, after: FlowDoc): DemotionDelta {
  const from = probeDemotion(before);
  const to = probeDemotion(after);

  // Fail closed. If the oracle cannot read the document it is protecting, it
  // has no basis to approve a change to it, so the change is refused and the
  // reason is surfaced rather than being downgraded to silence.
  if (!from.generated) {
    return { demoted: [], unverifiable: from.error ?? "the document could not be analysed" };
  }
  if (!to.generated) {
    return { demoted: [], ungeneratable: to.error ?? "the change made the document ungeneratable" };
  }

  const existed = new Set(before.content.Actions.map((a) => a.Identifier));
  const demoted = [...to.ids].filter((id) => existed.has(id) && !from.ids.has(id)).sort();
  return { demoted };
}
