/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The document the New flow dialog creates: the smallest one that passes the
// schema and every lint rule, so the first thing a user sees on a new canvas
// is a clean lint panel and an enabled Save. A flow is one
// DisconnectParticipant; a module is one EndFlowModuleExecution with the
// empty Settings Connect requires of a module (see FlowContent.Settings in
// @flow-as-code/core). tests/newFlowUi.test.tsx lints both.

import {
  FLOW_LANGUAGE_VERSION,
  FLOWDOC_VERSION,
  SLUG_PATTERN,
  autoLayout,
  type FlowDoc,
} from "@flow-as-code/core";

export type NewDocKind = "flow" | "module";

export function newDoc(name: string, kind: NewDocKind): FlowDoc {
  const action =
    kind === "module"
      ? { Identifier: "end", Type: "EndFlowModuleExecution" }
      : { Identifier: "disconnect", Type: "DisconnectParticipant" };
  const actions = [{ ...action, Parameters: {}, Transitions: {} }];
  return {
    flowdoc: FLOWDOC_VERSION,
    kind,
    name,
    connectType: kind === "module" ? "MODULE" : "CONTACT_FLOW",
    content: {
      Version: FLOW_LANGUAGE_VERSION,
      StartAction: action.Identifier,
      ...(kind === "module" ? { Settings: {} } : {}),
      Actions: actions,
    },
    layout: autoLayout(actions, action.Identifier),
    refs: [],
  };
}

/** Why a name cannot be used for a new document, or undefined when it can. */
export function newDocNameProblem(name: string, taken: readonly string[]): string | undefined {
  if (name === "") return "Name the flow.";
  if (!SLUG_PATTERN.test(name)) {
    return "Use lowercase letters, digits and single hyphens, like appointment-line.";
  }
  if (taken.includes(name)) return `"${name}" already exists in this directory.`;
  return undefined;
}
