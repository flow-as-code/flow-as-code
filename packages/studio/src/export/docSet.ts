/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Which documents an export covers.
//
// The whole store, not just the open document, because that is what the two
// IaC targets mean: `flow-cli emit` takes a directory, @flow-as-code/tf emits one
// configuration for the set (a `${cdref:module:x@prod}` resolves to a module
// the set emits), and the CDK binder needs one method per reference type
// anywhere in the set.
//
// The open document is taken from the canvas rather than re-read, so what is
// exported is what is on screen, including unsaved edits. That is the studio's
// own rule everywhere else, and the export gate refuses an invalid document
// either way.

import type { FlowDoc } from "@flow-as-code/core";
import type { DocStore } from "../store/types.js";

export async function exportDocSet(
  store: DocStore,
  openName: string | null,
  openDoc: FlowDoc | null,
): Promise<FlowDoc[]> {
  const refs = await store.list();
  const docs: FlowDoc[] = [];
  for (const ref of refs) {
    if (ref.name === openName && openDoc !== null) {
      docs.push(openDoc);
      continue;
    }
    docs.push((await store.read(ref.name)).doc);
  }
  // A store that does not list the open document (an opened single file) still
  // exports it.
  if (openDoc !== null && !docs.includes(openDoc)) docs.push(openDoc);
  return docs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
