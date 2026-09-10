/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MAX_ACTIONS_PER_FLOW } from "../../flowdoc.js";
import type { Rule } from "../types.js";

/**
 * "No more than 250 Actions per flow."
 * https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html
 * (transcribed in conformance/flow-language/actions.md, document envelope).
 *
 * The FlowDoc schema says maxItems 250, but nothing on the authoring path runs
 * the schema: render, codegen, materialization, and both emitters read the
 * document straight. `Flow.add` refuses the 251st block, so a flow built with
 * the builder cannot exceed the limit, but a FlowDoc that arrives any other way
 * (hand-edited, exported from an instance, produced by another tool) reached
 * emit with no complaint and failed at deploy time with a Connect error that
 * names no block. This rule is the check on the FlowDoc path.
 */
export const actionCount: Rule = {
  id: "action-count",
  description: `A flow holds no more than ${String(MAX_ACTIONS_PER_FLOW)} actions.`,
  check({ doc, report }) {
    const count = doc.content.Actions.length;
    if (count > MAX_ACTIONS_PER_FLOW) {
      report({
        severity: "error",
        message: `Flow has ${String(count)} actions; Connect allows at most ${String(
          MAX_ACTIONS_PER_FLOW,
        )}.`,
      });
    }
  },
};
