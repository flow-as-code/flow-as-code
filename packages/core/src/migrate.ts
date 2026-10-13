/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Reading an older FlowDoc. docs/01-flowdoc-spec.md: every version bump ships
// a migration in this package plus fixtures (conformance/migrate).
//
// 0.1 to 0.2 and 0.2 to 0.3 are each a version bump and nothing else. 0.2
// added the `view` reference type, `meta.sourceKind`, and an optional
// `description`; 0.3 added the `tasktemplate`, `casetemplate`, `casefield`,
// `assistant` and `phonenumber` reference types (docs/01-flowdoc-spec.md,
// "Versioning"). An older document simply lacks them; nothing an older
// document could say means something different in 0.3. Every reader (the
// CLI, the studio, the CDK construct, the Terraform emitters) runs this on
// the way in, so the rest of the code sees one version.

import type { FlowDoc } from "./flowdoc.js";
import { FLOWDOC_VERSION, InvalidFlowDocError, assertFlowDoc } from "./flowdoc.js";

/** Every format version this build reads, oldest first. */
export const SUPPORTED_FLOWDOC_VERSIONS = ["0.1", "0.2", FLOWDOC_VERSION] as const;

export type SupportedFlowDocVersion = (typeof SUPPORTED_FLOWDOC_VERSIONS)[number];

/** Whether a document's `flowdoc` field names a version this build reads. */
export function isSupportedFlowDocVersion(version: unknown): version is SupportedFlowDocVersion {
  return (
    typeof version === "string" &&
    (SUPPORTED_FLOWDOC_VERSIONS as readonly string[]).includes(version)
  );
}

/**
 * A document at the current format version, whatever supported version it was
 * read at. A current document comes back as is; an unsupported version throws
 * InvalidFlowDocError naming it and the versions this build reads.
 */
export function migrateFlowDoc(value: unknown, context = "migrateFlowDoc"): FlowDoc {
  assertFlowDoc(value, context);
  const version = (value as { flowdoc?: unknown }).flowdoc;
  if (version === FLOWDOC_VERSION) return value;
  if (version === "0.1" || version === "0.2") return { ...value, flowdoc: FLOWDOC_VERSION };
  throw new InvalidFlowDocError(
    `${context}: FlowDoc version ${JSON.stringify(version)} is not supported; this build reads ${SUPPORTED_FLOWDOC_VERSIONS.map((v) => JSON.stringify(v)).join(", ")}.`,
  );
}
