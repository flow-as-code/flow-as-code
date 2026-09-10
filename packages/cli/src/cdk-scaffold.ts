/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The `emit --target cdk` scaffold, from the CLI's side.
//
// The generator itself lives in @flow-as-code/cdk/scaffold, because the
// studio's CDK export button has to produce the same bytes and the studio
// cannot import this package (@flow-as-code/cli depends on
// @flow-as-code/studio for its assets, so the reverse import would be a
// cycle). What is left here is the one thing that needs a filesystem view of
// the world: turning an output directory and a docs directory into the
// relative FLOW_DOCS expression.

import { relative, resolve, sep } from "node:path";

import { type CdkScaffoldInput, cdkScaffold } from "@flow-as-code/cdk/scaffold";
import type { FlowDoc } from "@flow-as-code/core";

export { CDK_SCAFFOLD_FILE, cdkScaffold, referencedNames } from "@flow-as-code/cdk/scaffold";
export type { CdkScaffoldInput };

/** `./flows`, `../flows`, or `.`: POSIX, always relative, always prefixed. */
export function sourceExpression(outDir: string, docsDir: string): string {
  const rel = relative(resolve(outDir), resolve(docsDir)).split(sep).join("/");
  if (rel === "") return ".";
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export interface CdkScaffoldForDirs {
  docs: readonly FlowDoc[];
  /** Directory the scaffold is written to. */
  outDir: string;
  /** Directory holding the `*.flowdoc.json` files FlowSet will read. */
  docsDir: string;
}

/** The scaffold for a pair of real directories. */
export function cdkScaffoldForDirs({ docs, outDir, docsDir }: CdkScaffoldForDirs): string {
  return cdkScaffold({ docs, source: sourceExpression(outDir, docsDir) });
}
