/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Shared builders for the @flow-as-code/cdk tests. Excluded from the package build
// (tsconfig.json); imported by flow-set.test.ts and integration.test.ts.

import { readFileSync } from "node:fs";

import {
  CheckHoursOfOperation,
  DisconnectParticipant,
  EndFlowModuleExecution,
  Flow,
  FlowModule,
  InvokeFlowModule,
  InvokeLambdaFunction,
  MessageParticipant,
  Refs,
  TransferToFlow,
  UpdateContactEventHooks,
  UpdateContactTargetQueue,
  synth,
  type EventHook,
  type FlowDoc,
} from "@flow-as-code/core";

import type { TokenBinder } from "./index.js";

/** The canonical demo flow (conformance/demo). */
export function demoDoc(): FlowDoc {
  const url = new URL("../../../conformance/demo/appointment-line.flowdoc.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as FlowDoc;
}

/** A one-message module; `text` varies to simulate a content change. */
export function callbackModule(text = "We can call you back instead."): FlowDoc {
  const module = new FlowModule({ name: "callback-offer" }).add(
    new MessageParticipant({ id: "offer-callback", text, next: "done", onError: "done" }),
    new EndFlowModuleExecution({ id: "done" }),
  );
  return synth(module);
}

/**
 * A small flow exercising every acceptance-relevant ref type: hours, queue,
 * lambda through the TokenBinder, and a module pinned to the live alias.
 */
export function routerFlow(): FlowDoc {
  const flow = new Flow({ name: "callback-router" }).add(
    new CheckHoursOfOperation({
      id: "check-hours",
      hours: Refs.hours("main-line"),
      onInHours: "set-queue",
      onOutOfHours: "goodbye",
      onError: "goodbye",
    }),
    new UpdateContactTargetQueue({
      id: "set-queue",
      queue: Refs.queue("appointments"),
      next: "look-up",
      onError: "goodbye",
    }),
    new InvokeLambdaFunction({
      id: "look-up",
      lambda: Refs.lambda("appointment-lookup"),
      timeoutSeconds: 8,
      next: "offer",
      onError: "goodbye",
    }),
    new InvokeFlowModule({
      id: "offer",
      module: Refs.module("callback-offer", "live"),
      next: "goodbye",
      onError: "goodbye",
    }),
    new DisconnectParticipant({ id: "goodbye" }),
  );
  return synth(flow);
}

/** A one-message flow, the shape a whisper or hold flow takes. */
export function messageFlow(name: string, text = "Please hold."): FlowDoc {
  const flow = new Flow({ name }).add(
    new MessageParticipant({ id: "say", text, next: "done", onError: "done" }),
    new DisconnectParticipant({ id: "done" }),
  );
  return synth(flow);
}

/**
 * A flow that points event hooks at other flows, one UpdateContactEventHooks
 * per hook as the catalog requires, then hands off to a queue. This is the
 * shape a main line takes when it sets its whisper and hold flows before
 * transferring.
 */
export function hookedFlow(name: string, hooks: Partial<Record<EventHook, string>>): FlowDoc {
  const entries = Object.entries(hooks) as [EventHook, string][];
  const blocks = entries.map(
    ([hook, target], i) =>
      new UpdateContactEventHooks({
        id: `hook-${hook}`,
        hook,
        flow: Refs.flow(target),
        next: i + 1 < entries.length ? `hook-${entries[i + 1]![0]}` : "set-queue",
        onError: "done",
      }),
  );
  const flow = new Flow({ name }).add(
    ...blocks,
    new UpdateContactTargetQueue({
      id: "set-queue",
      queue: Refs.queue("appointments"),
      next: "done",
      onError: "done",
    }),
    new DisconnectParticipant({ id: "done" }),
  );
  return synth(flow);
}

/** A flow whose first action transfers to another flow by reference. */
export function transferFlow(name: string, to: string): FlowDoc {
  const flow = new Flow({ name }).add(
    new TransferToFlow({ id: "hand-off", flow: Refs.flow(to), next: "done", onError: "done" }),
    new DisconnectParticipant({ id: "done" }),
  );
  return synth(flow);
}

/** Deterministic opaque-string binder; every value is clearly not an ARN. */
export function opaqueBinder(): TokenBinder {
  return {
    queue: (n) => `QUEUE_TOKEN[${n}]`,
    hours: (n) => `HOURS_TOKEN[${n}]`,
    lambda: (n) => `LAMBDA_TOKEN[${n}]`,
    lex: (n) => `LEX_TOKEN[${n}]`,
    prompt: (n) => `PROMPT_TOKEN[${n}]`,
  };
}
