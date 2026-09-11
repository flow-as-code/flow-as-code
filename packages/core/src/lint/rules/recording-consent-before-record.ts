/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { announcePaths, recordingEnablerPath } from "../../catalog.js";
import { readPath } from "../../paths.js";
import { actionsById, transitionTargets } from "../graph.js";
import type { FlowAction, FlowDoc } from "../../flowdoc.js";
import type { Rule } from "../types.js";

/**
 * Recording a caller without first telling them is a legal problem in many
 * jurisdictions. This rule is deliberately generic: it requires that every path
 * reaching an action which enables recording passes through an action that
 * plays the participant something first. What that message says is the
 * operator's business; that one exists is checkable here.
 *
 * Which actions enable recording, and which play something, comes from the
 * catalog (conformance/flow-language/catalog.json): recordingEnabler names
 * the list whose non-empty value turns recording on ("An empty list disables
 * recording", per the action's documentation), and announces names the
 * fields whose non-blank string the participant hears.
 */
function enablesRecording(action: FlowAction): boolean {
  const path = recordingEnablerPath(action.Type);
  if (path === undefined) return false;
  return readPath(action.Parameters, path).some(
    (hit) => Array.isArray(hit.value) && hit.value.length > 0,
  );
}

/**
 * MessageParticipant carries exactly one of Text, SSML, or PromptId.
 * GetParticipantInput plays its prompt before waiting for a key ("This call
 * may be recorded. Press 1 to continue." is the usual consent menu), but every
 * prompt field is optional on its action page, so a menu with none is silent.
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipant.html
 * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
 *
 * Content is what counts, not the key: the studio's body switch writes
 * `Text: ""` until the author types, and an empty or blank Text or SSML plays
 * nothing on either action.
 */
function announces(action: FlowAction): boolean {
  return announcePaths(action.Type).some((path) =>
    readPath(action.Parameters, path).some(
      (hit) => typeof hit.value === "string" && hit.value.trim() !== "",
    ),
  );
}

/** Ids from which `targetId` is reachable without passing an announcement. */
function pathsWithoutAnnouncement(doc: FlowDoc, targetId: string): boolean {
  const byId = actionsById(doc);
  const seen = new Set<string>();
  const queue: string[] = [doc.content.StartAction];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const action = byId.get(id);
    if (action === undefined) continue;
    // An announcement on this path satisfies the rule, so stop exploring it.
    if (announces(action)) continue;
    queue.push(...transitionTargets(action));
  }
  return false;
}

export const recordingConsentBeforeRecord: Rule = {
  id: "recording-consent-before-record",
  description: "Recording must not start before the participant has been played a message.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      if (!enablesRecording(action)) continue;
      if (pathsWithoutAnnouncement(doc, action.Identifier)) {
        report({
          severity: "error",
          blockId: action.Identifier,
          message:
            "Recording is enabled on a path that plays no message first. Announce recording before starting it.",
        });
      }
    }
  },
};
