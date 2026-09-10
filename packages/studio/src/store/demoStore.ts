/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The canonical demo FlowDoc, imported at build time so the studio works with
// zero network access. conformance/demo is the single source of the demo flow
// (docs/01-flowdoc-spec.md, Contract artifacts).

import type { FlowDoc } from "@flow-as-code/core";
import demo from "../../../../conformance/demo/appointment-line.flowdoc.json";
import { MemoryStore } from "./memoryStore.js";
import type { DocStore } from "./types.js";

export function demoDoc(): FlowDoc {
  // structuredClone: the JSON module is a shared singleton; stores must not
  // alias it or edits would leak between store instances.
  return structuredClone(demo) as unknown as FlowDoc;
}

export function createDemoStore(): DocStore {
  return new MemoryStore("demo", [demoDoc()]);
}
