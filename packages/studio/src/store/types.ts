/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The DocStore seam. A10 ships in-memory (demo, opened file) and
// File System Access stores; A11 adds an HTTP/WebSocket store over the
// `flow-cli studio` file/watch server behind this same interface. Nothing in
// the app may talk to persistence except through a DocStore.

import type { FlowDoc } from "@flow-as-code/core";

export interface DocRef {
  /** FlowDoc name; also the key passed to read and write. */
  name: string;
}

export interface DocStore {
  /** Where the docs live, for the toolbar ("demo", "folder", a file name). */
  readonly label: string;
  /** True when write persists somewhere a reload can see. */
  readonly persistent: boolean;
  /**
   * True when write always refuses. The canvas still edits (the document in
   * memory is the app's), but nothing leaves the tab: the toolbar hides Save
   * and the file buttons, and exports become in-page previews. The hosted demo
   * is the one such store (docs/05-hosted-demo.md).
   */
  readonly readOnly: boolean;
  list(): Promise<DocRef[]>;
  read(name: string): Promise<{ doc: FlowDoc; text: string }>;
  write(name: string, doc: FlowDoc): Promise<void>;
}
