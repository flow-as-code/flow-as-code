/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @flow-as-code/hcl: HCL as a third view over FlowDoc (ADR-0007). This entry
// point is browser-safe: no Node built-ins, so the studio bundles it.

export type * from "./ast.js";
export { HclError, type Position } from "./errors.js";
export { lex } from "./lexer.js";
export { parse } from "./parser.js";
export { print, printTokens, sourceOf } from "./print.js";
export { format, formatFile } from "./format.js";
export { evaluateLiteral, type LiteralValue } from "./literal.js";
export { hasLoneSurrogate, quote, unquoteLiteral } from "./quote.js";
export { bracketChange, endsLine, type Token, type TokenType } from "./tokens.js";
export * from "./contract.js";
export { fromFlowDoc, type FromFlowDocOptions } from "./write.js";
export {
  toFlowDoc,
  type KeptComments,
  type Normalization,
  type ReadResult,
  type Sidecar,
  type ToFlowDocOptions,
} from "./read.js";
export { readCarry, type Carry } from "./carry.js";
