/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The canonical demo flow: a neutral appointment line.
//
// Used by synth (A01), round-trip (A03), emitter goldens (A09), the studio,
// and the hosted demo. Deliberately includes an unmodeled action so
// GenericBlock passthrough is exercised by default.

import {
  CheckHoursOfOperation,
  DisconnectParticipant,
  Flow,
  GenericBlock,
  InvokeLambdaFunction,
  MessageParticipant,
  Refs,
  TransferContactToQueue,
  UpdateContactAttributes,
  UpdateContactTargetQueue,
} from "../index.js";

export function appointmentLine(): Flow {
  return new Flow({ name: "appointment-line", connectType: "CONTACT_FLOW" }).add(
    // UpdateFlowLoggingBehavior is documented but not modeled by the builder.
    new GenericBlock({
      id: "enable-logging",
      type: "UpdateFlowLoggingBehavior",
      parameters: { FlowLoggingBehavior: "Enabled" },
      next: "welcome",
    }),
    new MessageParticipant({
      id: "welcome",
      text: "Thanks for calling. Let's get you to the right place.",
      next: "check-hours",
      onError: "apologize",
    }),
    new CheckHoursOfOperation({
      id: "check-hours",
      hours: Refs.hours("main-line"),
      onInHours: "set-working-queue",
      onOutOfHours: "announce-closed",
      onError: "apologize",
    }),
    new UpdateContactTargetQueue({
      id: "set-working-queue",
      queue: Refs.queue("appointments"),
      next: "look-up-appointment",
      onError: "apologize",
    }),
    new InvokeLambdaFunction({
      id: "look-up-appointment",
      lambda: Refs.lambda("appointment-lookup"),
      timeoutSeconds: 8,
      responseType: "STRING_MAP",
      next: "record-lookup-result",
      // A lookup failure should not strand the caller; queue them anyway.
      onError: "transfer",
    }),
    new UpdateContactAttributes({
      id: "record-lookup-result",
      attributes: { appointmentFound: "$.External.appointmentFound" },
      next: "transfer",
      onError: "transfer",
    }),
    new TransferContactToQueue({
      id: "transfer",
      next: "hang-up",
      onQueueAtCapacity: "announce-busy",
      onError: "apologize",
    }),
    new MessageParticipant({
      id: "announce-closed",
      text: "We are closed right now. Please call back during business hours.",
      next: "hang-up",
      onError: "hang-up",
    }),
    new MessageParticipant({
      id: "announce-busy",
      text: "All of our lines are busy. Please try again shortly.",
      next: "hang-up",
      onError: "hang-up",
    }),
    new MessageParticipant({
      id: "apologize",
      text: "Something went wrong on our end. Please try again later.",
      next: "hang-up",
      onError: "hang-up",
    }),
    new DisconnectParticipant({ id: "hang-up" }),
  );
}
