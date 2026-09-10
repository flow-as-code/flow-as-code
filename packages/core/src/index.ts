/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Public surface of @flow-as-code/core. See SPEC.md and docs/01-flowdoc-spec.md.
//
// Implemented: FlowDoc types, Refs, builder blocks, deterministic
// serialization, dagre auto-layout, synth, lint, codegen, materialization,
// export from a live instance, and the simulate scenario format, runner, and
// reporters. Watch (A04) lives in @flow-as-code/cli.

export * from "./flowdoc.js";
export * from "./refs.js";
export * from "./actions.js";
export * from "./blocks.js";
export * from "./flow.js";
export * from "./synth.js";
export * from "./codegen.js";
export * from "./package-names.js";
export { autoLayout, NODE_WIDTH, NODE_HEIGHT } from "./layout.js";
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
export * from "./lint/index.js";
