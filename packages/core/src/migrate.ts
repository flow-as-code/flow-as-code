/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Reading an older FlowDoc. docs/01-flowdoc-spec.md: every version bump ships
// a migration in this package plus fixtures (conformance/migrate).
//
// 0.1 to 0.2 is a version bump and nothing else. 0.2 added the `view`
// reference type, `meta.sourceKind`, and an optional `description`, all of
// which a 0.1 document simply lacks; nothing a 0.1 document could say means
// something different in 0.2. Every reader (the CLI, the studio, the CDK
// construct, the Terraform emitter) runs this on the way in, so the rest of
// the code sees one version.

import type { FlowDoc } from "./flowdoc.js";
import { FLOWDOC_VERSION, InvalidFlowDocError, assertFlowDoc } from "./flowdoc.js";

/** Every format version this build reads, oldest first. */
export const SUPPORTED_FLOWDOC_VERSIONS = ["0.1", FLOWDOC_VERSION] as const;

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
  if (version === "0.1") return { ...value, flowdoc: FLOWDOC_VERSION };
  throw new InvalidFlowDocError(
    `${context}: FlowDoc version ${JSON.stringify(version)} is not supported; this build reads ${SUPPORTED_FLOWDOC_VERSIONS.map((v) => JSON.stringify(v)).join(" and ")}.`,
  );
}
