/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// FLOW_TYPE_RESTRICTIONS is the whole content of the action-allowed-in-flow-type
// rule. The rule had one fixture, so the table could be emptied entry by entry
// with the suite green, and it was also incomplete: a CUSTOMER_HOLD flow full
// of actions the doc pages forbid in hold flows linted clean.
//
// Two things are pinned here: the exact table (so no entry can be deleted or
// widened silently) and the modeled set's coverage (so a new block cannot land
// with its Restrictions section unread).

import { describe, expect, it } from "vitest";
import type { ConnectType, FlowDoc } from "./index.js";
import {
  ActionType,
  FLOW_LANGUAGE_VERSION,
  FLOW_TYPE_RESTRICTIONS,
  FLOW_TYPE_UNRESTRICTED,
  FLOWDOC_VERSION,
  lint,
} from "./index.js";

const RULE = "action-allowed-in-flow-type";

const ALL_CONNECT_TYPES: readonly ConnectType[] = [
  "CONTACT_FLOW",
  "CUSTOMER_QUEUE",
  "CUSTOMER_HOLD",
  "CUSTOMER_WHISPER",
  "AGENT_HOLD",
  "AGENT_WHISPER",
  "OUTBOUND_WHISPER",
  "AGENT_TRANSFER",
  "QUEUE_TRANSFER",
  "MODULE",
];

/**
 * Transcribed from the Restrictions section of each action's doc page; the
 * URLs are in actions.ts beside each entry. Spelled out literally so that
 * deleting or widening an entry in actions.ts fails here, which a test that
 * iterated the table itself would not do.
 */
const EXPECTED: Record<string, string[]> = {
  MessageParticipant: [
    "CONTACT_FLOW",
    "AGENT_TRANSFER",
    "QUEUE_TRANSFER",
    "CUSTOMER_WHISPER",
    "AGENT_WHISPER",
    "OUTBOUND_WHISPER",
    "CUSTOMER_QUEUE",
    "MODULE",
  ],
  GetParticipantInput: [
    "CONTACT_FLOW",
    "AGENT_TRANSFER",
    "QUEUE_TRANSFER",
    "CUSTOMER_QUEUE",
    "MODULE",
  ],
  DisconnectParticipant: [
    "CONTACT_FLOW",
    "AGENT_TRANSFER",
    "QUEUE_TRANSFER",
    "CUSTOMER_QUEUE",
    "MODULE",
  ],
  CheckHoursOfOperation: [
    "CONTACT_FLOW",
    "AGENT_TRANSFER",
    "QUEUE_TRANSFER",
    "CUSTOMER_QUEUE",
    "MODULE",
  ],
  EndFlowExecution: [
    "CUSTOMER_WHISPER",
    "AGENT_WHISPER",
    "OUTBOUND_WHISPER",
    "CUSTOMER_QUEUE",
    "MODULE",
  ],
  EndFlowModuleExecution: ["MODULE"],
  InvokeFlowModule: ["CONTACT_FLOW", "MODULE"],
  TransferContactToQueue: ["CONTACT_FLOW", "AGENT_TRANSFER", "QUEUE_TRANSFER", "MODULE"],
  UpdateContactTargetQueue: ["CONTACT_FLOW", "AGENT_TRANSFER", "QUEUE_TRANSFER", "MODULE"],
  TransferToFlow: ["CONTACT_FLOW", "AGENT_TRANSFER", "QUEUE_TRANSFER", "MODULE"],
  UpdateContactRecordingBehavior: [
    "CONTACT_FLOW",
    "AGENT_TRANSFER",
    "QUEUE_TRANSFER",
    "OUTBOUND_WHISPER",
    "CUSTOMER_QUEUE",
    "MODULE",
  ],
};

function docWith(type: string, connectType: ConnectType): FlowDoc {
  return {
    flowdoc: FLOWDOC_VERSION,
    kind: connectType === "MODULE" ? "module" : "flow",
    name: "case",
    connectType,
    content: {
      Version: FLOW_LANGUAGE_VERSION,
      StartAction: "subject",
      Actions: [{ Identifier: "subject", Type: type, Parameters: {}, Transitions: {} }],
    },
  };
}

const findingsFor = (type: string, connectType: ConnectType) =>
  lint(docWith(type, connectType)).filter((f) => f.rule === RULE);

describe("FLOW_TYPE_RESTRICTIONS", () => {
  it("is exactly the transcribed table", () => {
    expect(
      Object.fromEntries(Object.entries(FLOW_TYPE_RESTRICTIONS).map(([k, v]) => [k, [...v]])),
    ).toEqual(EXPECTED);
  });

  it("covers every modeled action type, restricted or explicitly not", () => {
    const covered = new Set([...Object.keys(FLOW_TYPE_RESTRICTIONS), ...FLOW_TYPE_UNRESTRICTED]);
    expect([...Object.values(ActionType)].filter((t) => !covered.has(t))).toEqual([]);
  });

  it("records the unrestricted actions rather than leaving a gap", () => {
    expect([...FLOW_TYPE_UNRESTRICTED].sort()).toEqual([
      "Compare",
      "InvokeLambdaFunction",
      "UpdateContactAttributes",
    ]);
  });

  it("names only real ConnectType values", () => {
    for (const [type, allowed] of Object.entries(FLOW_TYPE_RESTRICTIONS)) {
      for (const value of allowed) {
        expect(ALL_CONNECT_TYPES, `${type} allows unknown flow type ${value}`).toContain(value);
      }
    }
  });
});

describe.each(Object.entries(EXPECTED))("%s", (type, allowed) => {
  const disallowed = ALL_CONNECT_TYPES.filter((t) => !allowed.includes(t));

  it("has at least one flow type it is not allowed in", () => {
    expect(disallowed.length).toBeGreaterThan(0);
  });

  it.each(allowed)("lints clean in %s", (connectType) => {
    expect(findingsFor(type, connectType as ConnectType)).toEqual([]);
  });

  it.each(disallowed)("is flagged in %s", (connectType) => {
    const found = findingsFor(type, connectType);
    expect(found).toHaveLength(1);
    expect(found[0]!.blockId).toBe("subject");
    expect(found[0]!.severity).toBe("error");
    expect(found[0]!.message).toContain(`${type} is not allowed in a ${connectType} flow`);
  });
});

describe.each(FLOW_TYPE_UNRESTRICTED)("%s", (type) => {
  it.each(ALL_CONNECT_TYPES)("lints clean in %s", (connectType) => {
    expect(findingsFor(type, connectType)).toEqual([]);
  });
});

describe("the audit case", () => {
  // Both actions document themselves as unsupported in hold flows, and both
  // used to lint clean there.
  it("flags MessageParticipant and CheckHoursOfOperation in a CUSTOMER_HOLD flow", () => {
    const doc = docWith(ActionType.MessageParticipant, "CUSTOMER_HOLD");
    doc.content.Actions.push({
      Identifier: "hours",
      Type: ActionType.CheckHoursOfOperation,
      Parameters: {},
      Transitions: {},
    });
    expect(lint(doc).filter((f) => f.rule === RULE)).toHaveLength(2);
  });
});
