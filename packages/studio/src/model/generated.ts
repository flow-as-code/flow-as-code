/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A FlowDoc some other generator owns.
//
// docs/01-flowdoc-spec.md gives `meta.generator` two forms: `core@<format>`
// from `synth()` and `cli@<version>` from `flow-cli synth` and the bridge.
// Those are this toolchain's own stamps, and a document carrying one is the
// user's to edit on the canvas. Anything else there is a generator the user
// runs (a script writing FlowDocs from a config), and an edit on the canvas
// lasts until its next run. The studio says so, and asks once before the
// first edit; it never writes anything into the document for it.

import type { FlowDoc } from "@flow-as-code/core";

const OWN_GENERATOR = /^(core|cli)@/;

/** The foreign generator's name as the document records it, or undefined. */
export function foreignGenerator(doc: FlowDoc | null): string | undefined {
  const generator = doc?.meta?.generator;
  if (typeof generator !== "string" || generator === "") return undefined;
  return OWN_GENERATOR.test(generator) ? undefined : generator;
}

/** What the dialog says before the first edit of a generated document. */
export function generatedEditWarning(generator: string): string {
  return (
    `This document is written by ${generator}, and the next run of it will overwrite ` +
    "whatever you change here. Edit the generator's input instead, or go ahead if this is a " +
    "one-off: nothing is written to the document to say it was edited."
  );
}
