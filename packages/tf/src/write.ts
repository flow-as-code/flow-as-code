/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The filesystem half of the emitter, kept apart from emit.ts so the emitter
// itself stays pure and the goldens compare bytes with no disk involved.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FlowDoc } from "@flow-as-code/core";
import { type EmitTfOptions, type EmitTfResult, emitTf } from "./emit.js";

/**
 * Emits `docs` and writes the result under `outDir`, creating directories as
 * needed. Returns the emitted files so a caller can report or re-check them.
 *
 * Existing files are overwritten and nothing else in `outDir` is touched: the
 * user owns their provider, backend, and resource files, and this emitter must
 * never remove them.
 */
export function writeTf(
  docs: readonly FlowDoc[],
  outDir: string,
  options: EmitTfOptions = {},
): EmitTfResult {
  const result = emitTf(docs, options);
  for (const [relative, content] of Object.entries(result.files)) {
    const target = join(outDir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return result;
}
