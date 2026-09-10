/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// In-memory DocStore backing the built-in demo and single opened files.
// Writes serialize through @flow-as-code/core so the stored text is byte-stable and
// layout round-trips exactly.
//
// write() runs assertSaveable first: the gate lives at the byte-producing
// call, not in the Save button, so no caller can route around it.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { assertSaveable } from "../model/validate.js";
import type { DocRef, DocStore } from "./types.js";

export class MemoryStore implements DocStore {
  readonly persistent = false;
  readonly readOnly = false;
  private readonly texts = new Map<string, string>();

  constructor(
    readonly label: string,
    docs: readonly FlowDoc[],
  ) {
    for (const doc of docs) this.texts.set(doc.name, serialize(doc));
  }

  list(): Promise<DocRef[]> {
    return Promise.resolve([...this.texts.keys()].sort().map((name) => ({ name })));
  }

  read(name: string): Promise<{ doc: FlowDoc; text: string }> {
    const text = this.texts.get(name);
    if (text === undefined) return Promise.reject(new Error(`No document named "${name}".`));
    return Promise.resolve({ doc: JSON.parse(text) as FlowDoc, text });
  }

  write(name: string, doc: FlowDoc): Promise<void> {
    try {
      assertSaveable(doc);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    this.texts.set(name, serialize(doc));
    return Promise.resolve();
  }
}
