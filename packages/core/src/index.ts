/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Public surface of @flow-as-code/core. See SPEC.md and docs/01-flowdoc-spec.md.
//
// Implemented: FlowDoc types, Refs, builder blocks, deterministic
// serialization, auto-layout, synth, lint, codegen, materialization,
// export from a live instance, and the simulate scenario format, runner, and
// reporters. Watch (A04) lives in @flow-as-code/cli.

export * from "./flowdoc.js";
export * from "./migrate.js";
export * from "./refs.js";
export * from "./actions.js";
export * from "./catalog.js";
export * from "./hcl-names.js";
export * from "./paths.js";
export * from "./blocks.js";
export * from "./flow.js";
export * from "./synth.js";
export * from "./codegen.js";
export * from "./package-names.js";
export {
  autoLayout,
  LAYOUT_MARGIN,
  NODE_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  RANK_GAP,
} from "./layout.js";
export { canonicalize, serialize } from "./serialize.js";
export {
  MaterializeError,
  materializeWithBinder,
  materializeWithMap,
  serializeContent,
} from "./materialize.js";
export * from "./aws.js";
export * from "./export.js";
export * from "./simulate.js";
export * from "./scenario-check.js";
export * from "./lint/index.js";
