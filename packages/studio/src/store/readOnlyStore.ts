/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A DocStore that refuses every write.
//
// The hosted demo (docs/05-hosted-demo.md) is the studio with nowhere to save:
// no bridge, no file handles, no download. Rather than teaching each write path
// about that, the store says so and the app reads `readOnly` off the seam it
// already has. Edits still happen on the canvas, because the document in
// memory is the app's own copy, and a reload restores the pristine demo
// because nothing was kept.
//
// Reads delegate to the wrapped store so the demo's MemoryStore keeps the
// byte-stable serialization it already does.

import type { FlowDoc } from "@flow-as-code/core";
import type { DocRef, DocStore } from "./types.js";

export const READ_ONLY_MESSAGE =
  "This is a read-only demo: edits stay in this tab and are not saved. " +
  "Reload the page to restore the demo flow.";

export class ReadOnlyStore implements DocStore {
  readonly persistent = false;
  readonly readOnly = true;
  readonly label: string;

  constructor(private readonly inner: DocStore) {
    this.label = inner.label;
  }

  list(): Promise<DocRef[]> {
    return this.inner.list();
  }

  read(name: string): Promise<{ doc: FlowDoc; text: string }> {
    return this.inner.read(name);
  }

  write(_name: string, _doc: FlowDoc): Promise<void> {
    return Promise.reject(new Error(READ_ONLY_MESSAGE));
  }
}

export function readOnly(store: DocStore): DocStore {
  return new ReadOnlyStore(store);
}
