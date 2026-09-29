/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Dotted paths into an action's Parameters, the notation the catalog uses to
// name a reference-bearing or text-bearing field wherever it sits.
//
//   PromptId              a top-level key
//   LexV2Bot.AliasArn     a key inside an object
//   Messages[].PromptId   a key inside every element of a list
//   EventHooks.*          every value of a map
//
// A flat key table cannot name the last three, and the reference-bearing
// fields the modeled set grows into include all of them. Browser-safe: no
// Node builtins, so the lint rules may use it.

/** One value found at a concrete path, `Messages[2].PromptId` for example. */
export interface PathHit {
  path: string;
  value: unknown;
}

const SEGMENT = /^(?:\*|([A-Za-z0-9_$-]+)(\[\])?)$/;

/** Whether a string is a well-formed catalog path. */
export function isCatalogPath(path: string): boolean {
  return path !== "" && path.split(".").every((s) => SEGMENT.test(s));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Every value at `path` within `value`. A path that does not exist in the
 * value yields nothing; a malformed path throws, because it is a catalog
 * error rather than a document one.
 */
export function readPath(value: unknown, path: string): PathHit[] {
  if (!isCatalogPath(path)) throw new Error(`"${path}" is not a catalog path.`);
  let hits: PathHit[] = [{ path: "", value }];
  for (const segment of path.split(".")) {
    const next: PathHit[] = [];
    for (const hit of hits) {
      if (segment === "*") {
        if (!isRecord(hit.value)) continue;
        for (const [k, v] of Object.entries(hit.value))
          next.push({ path: join(hit.path, k), value: v });
        continue;
      }
      const m = SEGMENT.exec(segment)!;
      const key = m[1]!;
      if (!isRecord(hit.value) || !Object.hasOwn(hit.value, key)) continue;
      const at = hit.value[key];
      if (m[2] === undefined) {
        next.push({ path: join(hit.path, key), value: at });
      } else if (Array.isArray(at)) {
        at.forEach((v, i) => next.push({ path: `${join(hit.path, key)}[${String(i)}]`, value: v }));
      }
    }
    hits = next;
  }
  return hits;
}

const join = (prefix: string, key: string): string => (prefix === "" ? key : `${prefix}.${key}`);
