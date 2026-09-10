/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Web Worker entry: lint off the main thread on every doc change.
// @flow-as-code/core/lint is dependency-free and browser-safe
// (enforced by @flow-as-code/core's lint-browser-safe test).

import { handleLintRequest } from "./lintProtocol.js";

// The event data is untrusted (anything can postMessage to a worker), so it
// arrives as unknown and handleLintRequest validates it.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handleLintRequest(event.data));
};
