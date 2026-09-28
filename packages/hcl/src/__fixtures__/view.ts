/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { autoLayout, collectRefs, serialize, type FlowDoc } from "@flow-as-code/core";

/**
 * What any view of a document holds (conformance/hcl/README.md rule 26): the
 * synth normal form, which derives refs, gives a module its Settings and
 * lays out every action, less content.Metadata, which no view authors, with
 * positions rounded to the integers the canvas and the provider use.
 */
export function viewed(doc: FlowDoc): FlowDoc {
  const { Metadata: _metadata, ...content } = doc.content;
  if (doc.kind === "module") content.Settings ??= {};
  const auto = autoLayout(content.Actions, content.StartAction);
  const layout = Object.fromEntries(
    content.Actions.map((a) => {
      const p = doc.layout?.[a.Identifier] ?? auto[a.Identifier]!;
      return [a.Identifier, { x: Math.round(p.x), y: Math.round(p.y) }];
    }),
  );
  return { ...doc, content, layout, refs: collectRefs(content) };
}

/** A document without meta, in canonical bytes: what the invariant compares. */
export function bytes(doc: FlowDoc): string {
  const { meta: _meta, ...rest } = doc;
  return serialize(rest as FlowDoc);
}
