/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { catalogEntry, channelRestriction } from "../../catalog.js";
import type { Rule } from "../types.js";

/**
 * Two modeled actions are restricted by channel rather than by flow type:
 * Wait "is supported only by the chat channel" and ShowView "is only
 * supported on the chat channel" (the catalog's `channels`, from each
 * action's page; an unmodeled entry may carry it too since FlowDoc 0.3, so
 * a generic block is reported the same way once its page is recorded). A contact flow's channel is decided by the contact that
 * reaches it, not by the document, and FlowDoc records no channel, so the
 * finding is a warning: an inbound flow may serve chat alone, and the
 * document cannot say so. The message names the channels the page allows
 * and the page itself.
 *
 * Added 2026-10-05 (tasks/C03). The severity rises to error only on a
 * create the service refuses, recorded in actions.md rule 37.
 */
export const channelRestrictedAction: Rule = {
  id: "channel-restricted-action",
  description:
    "An action whose page restricts it to some channels is reported, since a document does not record which channels its flow serves.",
  check({ doc, report }) {
    for (const action of doc.content.Actions) {
      const channels = channelRestriction(action.Type);
      if (channels === undefined) continue;
      const page = catalogEntry(action.Type)?.doc ?? "";
      report({
        severity: "warning",
        blockId: action.Identifier,
        message: `${action.Type} is supported only on the ${channels.join(", ")} channel${channels.length > 1 ? "s" : ""}, and the document does not record which channels this ${doc.kind} serves. ${page}`,
      });
    }
  },
};
