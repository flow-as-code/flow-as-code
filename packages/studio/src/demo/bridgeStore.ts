/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Stands in for src/store/bridgeStore.ts in the hosted demo build.
//
// The real BridgeStore is the studio's only network client, and it is
// unreachable in a static build because no `flow-cli studio` process injects a
// bridge description into a page a static host serves. Unreachable is not the
// same as absent: the bundle would still carry `fetch(` and the long-poll
// loop, and the offline proof (tests/demo-bundle.test.ts) scans for exactly
// those primitives. So the demo build swaps this file in through
// vite.config.ts, and the bundle contains no way to make a request at all.
//
// Every value export of the real module exists here with the same name, so
// the importers (state/studio.tsx, hooks/useBridgeSync.ts, export/deliver.ts)
// compile against the real types and run against this. `instanceof
// BridgeStore` is false for every store because no instance can be
// constructed; `createBridgeStore` answers undefined, which is the same answer
// the real one gives a page without a bridge. tests/demoStubs.test.ts keeps the
// export surface identical.

import type { FlowDoc } from "@flow-as-code/core";
import type { BridgeConflict, BridgeInfo } from "../store/bridgeProtocol.js";
import type { DocRef, DocStore } from "../store/types.js";

const NO_BRIDGE = "The hosted demo has no bridge: nothing here is served by flow-cli studio.";

/** Same shape as the real error, so `instanceof` narrowing in the app compiles. */
export class BridgeConflictError extends Error {
  readonly conflict: BridgeConflict;

  constructor(conflict: BridgeConflict, message: string) {
    super(message);
    this.name = "BridgeConflictError";
    this.conflict = conflict;
  }
}

/** Cannot be constructed; exists so `instanceof BridgeStore` has a class to test. */
export class BridgeStore implements DocStore {
  readonly persistent = true;
  readonly readOnly = false;
  readonly label: string;
  readonly info: BridgeInfo;

  constructor(info: BridgeInfo) {
    this.info = info;
    this.label = info.label;
    throw new Error(NO_BRIDGE);
  }

  list(): Promise<DocRef[]> {
    return Promise.reject(new Error(NO_BRIDGE));
  }

  read(_name: string): Promise<{ doc: FlowDoc; text: string }> {
    return Promise.reject(new Error(NO_BRIDGE));
  }

  write(_name: string, _doc: FlowDoc): Promise<void> {
    return Promise.reject(new Error(NO_BRIDGE));
  }

  postExport(): Promise<never> {
    return Promise.reject(new Error(NO_BRIDGE));
  }

  resolve(): Promise<never> {
    return Promise.reject(new Error(NO_BRIDGE));
  }

  subscribe(): () => void {
    return () => {};
  }
}

/** A static page is never served by a bridge. */
export function servedByBridge(): undefined {
  return undefined;
}

/** Same answer the real function gives a page without a bridge. */
export function createBridgeStore(): undefined {
  return undefined;
}

/** There is nothing to ask and no way to ask it. */
export function fetchBridgeInfo(): Promise<never> {
  return Promise.reject(new Error(NO_BRIDGE));
}
