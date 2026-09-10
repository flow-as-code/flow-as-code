/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// TokenBinder: the user's side of CDK materialization.
//
// A binder maps each non-module reference in a FlowDoc to a string, normally a
// CloudFormation token from an L1/L2 construct attribute (queue.attrQueueArn,
// fn.functionArn, a Lex alias ARN). @flow-as-code/core's materializeWithBinder inserts
// the returned string byte-for-byte, so CDK tokens survive untouched and
// CloudFormation resolves them per account at deploy time. No resource map, no
// literal ARNs in this path.
//
// Module references (`${cdref:module:name@alias}`) are deliberately absent:
// FlowSet manages the module resources itself and resolves those tokens to the
// alias ARN of the CfnContactFlowModuleAlias it created (see flow-set.ts).

import type { RefEntry } from "@flow-as-code/core";

/**
 * Maps reference names to CloudFormation-token strings. Implemented by the
 * user, typically as thin closures over constructs in the same stack.
 *
 * `flow` is optional because cross-flow references are rare; a doc set that
 * uses `${cdref:flow:...}` against a binder without `flow()` fails synth with
 * an error naming the token.
 */
/**
 * Boundary worth knowing: a binder may return any opaque string and it passes
 * through byte-exact, EXCEPT that CDK itself parses `${Token[...]}` markers.
 * Returning a string containing an unregistered marker such as
 * `${Token[TOKEN.999]}` fails deep inside aws-cdk-lib with "Unrecognized token
 * key". Real tokens (Fn.importValue, attr getters) are registered and fine.
 * This is CDK's behavior, not something this package can intercept.
 */
export interface TokenBinder {
  /** ARN of the queue, e.g. `queue.attrQueueArn`. */
  queue(name: string): string;
  /** ARN of the hours of operation, e.g. `hours.attrHoursOfOperationArn`. */
  hours(name: string): string;
  /** ARN of the Lambda function, e.g. `fn.functionArn`. */
  lambda(name: string): string;
  /** ARN of the Lex bot alias. */
  lex(name: string): string;
  /** ARN of the prompt. */
  prompt(name: string): string;
  /** ARN of a contact flow not managed by this FlowSet. */
  flow?(name: string): string;
}

/**
 * Resolves one non-module reference through the binder. Throws a diagnostic
 * naming the token, the document, and the missing method when the binder
 * cannot answer, so the failure is actionable without a stack-trace dig.
 */
export function bindRef(binder: TokenBinder, ref: RefEntry, docName: string): string {
  if (ref.type === "module") {
    // FlowSet resolves module refs itself; reaching here is a programming
    // error in the caller, not a binder gap.
    throw new Error(`Internal: module ref ${ref.token} must be resolved by FlowSet, not a binder.`);
  }
  const method = binder[ref.type];
  if (typeof method !== "function") {
    throw new Error(
      `TokenBinder has no ${ref.type}() method, but "${docName}" contains ${ref.token}. ` +
        `Implement ${ref.type}(name) on the binder.`,
    );
  }
  const value = method.call(binder, ref.name);
  if (typeof value !== "string") {
    throw new Error(
      `TokenBinder.${ref.type}("${ref.name}") returned ${String(value)} for ${ref.token} ` +
        `in "${docName}". Binder methods must return a string.`,
    );
  }
  return value;
}
