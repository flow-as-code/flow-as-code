/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Export-as-download. This is a write path like any other: without the File
// System Access API (Firefox, Safari) it is the only way edits leave the
// studio, so it runs the same assertSaveable gate the stores run. The gate is
// in exportBlob(), not in the button handler, so it cannot be bypassed.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { assertSaveable } from "../model/validate.js";

export function exportFileName(doc: FlowDoc): string {
  return `${doc.name}.flowdoc.json`;
}

/**
 * The bytes an export produces. Throws SaveRefusedError when the doc fails a
 * hard lint rule or the FlowDoc schema.
 */
export function exportText(doc: FlowDoc): string {
  assertSaveable(doc);
  return serialize(doc);
}

/** The same bytes as a Blob. */
export function exportBlob(doc: FlowDoc): Blob {
  return new Blob([exportText(doc)], { type: "application/json" });
}

/**
 * Hands one file to the browser. Shared with the export targets' download sink
 * (src/export/deliver.ts), so every file the studio saves without a bridge
 * leaves through the same anchor.
 */
export function downloadFile(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  // Firefox only follows a programmatic click on an anchor in the document,
  // and revoking synchronously can cancel a download that has not started
  // yet, so the revoke waits a task.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Triggers the browser download. Throws before touching the DOM if refused. */
export function downloadDoc(doc: FlowDoc): void {
  // exportText first: the gate has to refuse before anything reaches the DOM.
  downloadFile(exportFileName(doc), exportText(doc), "application/json");
}
