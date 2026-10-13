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
// References to documents in the same FlowSet never reach a binder: FlowSet
// resolves a `${cdref:module:name@alias}` whose module it manages to the alias
// ARN of the CfnContactFlowModuleAlias it created, and a `${cdref:flow:name}`
// whose flow it manages to that flow's ARN (see flow-set.ts). The optional
// `flow()` and `module()` here are for documents managed elsewhere.

import type { RefEntry } from "@flow-as-code/core";

/** Alias a module is invoked through when the token pins none. */
export const DEFAULT_MODULE_ALIAS = "live";

/**
 * Maps reference names to CloudFormation-token strings. Implemented by the
 * user, typically as thin closures over constructs in the same stack.
 *
 * `flow` and `module` are optional because they are only consulted for a
 * document outside the set; a doc set that references one against a binder
 * without the method fails synth with an error naming the token.
 */
/**
 * Boundary worth knowing: a binder may return any opaque string and it passes
 * through byte-exact, EXCEPT that CDK itself parses `${Token[...]}` markers.
 * Returning a string containing an unregistered marker such as
 * `${Token[TOKEN.999]}` fails deep inside aws-cdk-lib with "Unrecognized token
 * key". Real tokens (Fn.importValue, attr getters) are registered and fine.
 * This is CDK's behavior, not something this package can intercept.
 *
 * A `Lazy.string` is a real token too, and the way to point at a construct
 * that does not exist yet when the binder is called: FlowSet materializes
 * content in its constructor, so a binder closing over another FlowSet in the
 * same stack defers the lookup with `Lazy.string({ produce: () => ... })` and
 * CDK resolves it at synth, when both constructs exist.
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
  /**
   * ARN of a contact flow not managed by this FlowSet. A flow in the set is
   * resolved by FlowSet itself and never reaches this method.
   */
  flow?(name: string): string;
  /**
   * Alias ARN of a module not managed by this FlowSet, at the alias the token
   * pins: `${cdref:module:survey@prod}` calls `module("survey", "prod")`, and a
   * token that pins none passes the default, `live`. A module in the set is
   * resolved by FlowSet itself and never reaches this method.
   */
  module?(name: string, alias: string): string;
  /**
   * ARN of a view, with the version the token pins when it pins one:
   * `${cdref:view:after-contact-work@1}` calls `view("after-contact-work", "1")`.
   * The AWS-managed views a flow usually shows have no CloudFormation resource,
   * so this is typically a literal built from the stack's region,
   * `arn:aws:connect:<region>:aws:view/<name>:<version>`.
   * https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html
   */
  view?(name: string, version?: string): string;
  /**
   * ARN of a task template (FlowDoc 0.3), for `CreateTask.TaskTemplateId`:
   * `arn:aws:connect:<region>:<account>:instance/<id>/task-template/<id>`.
   * hashicorp/aws has no resource for one; aws-cdk-lib has `CfnTaskTemplate`
   * (`attrArn`).
   * https://docs.aws.amazon.com/connect/latest/devguide/createtask.html
   */
  tasktemplate?(name: string): string;
  /**
   * The Cases template (FlowDoc 0.3) for `CreateCase.CaseTemplateId`, a
   * per-domain id or its ARN, as the action accepts it; aws-cdk-lib's
   * `CfnTemplate` in `aws-connectcases` has `attrTemplateArn` and
   * `attrTemplateId`.
   * https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
   */
  casetemplate?(name: string): string;
  /**
   * The Cases field id (FlowDoc 0.3) a `${cdref:casefield:<name>}` stands for
   * as a map key of `CaseRequestFields` or an item of `CaseResponseFields`
   * (docs/adr/0008-case-field-ids.md); aws-cdk-lib's `CfnField` has
   * `attrFieldId`. Resolution of a key is D06's; a token in a value resolves
   * through this today.
   */
  casefield?(name: string): string;
  /**
   * ARN of an Amazon Q in Connect assistant (FlowDoc 0.3), for
   * `CreateWisdomSession.WisdomAssistantArn`:
   * `arn:aws:wisdom:<region>:<account>:assistant/<id>`; aws-cdk-lib's
   * `CfnAssistant` in `aws-wisdom` has `attrAssistantArn`.
   * https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html
   */
  assistant?(name: string): string;
  /**
   * ARN of a phone number claimed to the instance (FlowDoc 0.3), for
   * `StartOutboundChatContact.SourceEndpoint.Address`:
   * `arn:aws:connect:<region>:<account>:phone-number/<id>`, which nests under
   * no instance; `CfnPhoneNumber.attrPhoneNumberArn`.
   * https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-startoutboundchatcontact.html
   */
  phonenumber?(name: string): string;
}

/**
 * Resolves one reference to a document or resource outside the FlowSet
 * through the binder. Throws a diagnostic naming the token, the document, and
 * the missing method when the binder cannot answer, so the failure is
 * actionable without a stack-trace dig. FlowSet calls this only for what it
 * does not resolve itself (binder-side types, and flows and modules outside
 * the set).
 */
export function bindRef(binder: TokenBinder, ref: RefEntry, docName: string): string {
  const method = binder[ref.type];
  if (typeof method !== "function") {
    // A module is the one type FlowSet would normally have answered, so its
    // message says both ways out: bring the document in, or bind it.
    throw new Error(
      ref.type === "module"
        ? `TokenBinder has no module() method, but "${docName}" contains ${ref.token} and no ` +
            `module named "${ref.name}" is in this FlowSet. Add the module's document to the set, ` +
            `or implement module(name, alias) on the binder to return the alias ARN of a module ` +
            `managed elsewhere.`
        : `TokenBinder has no ${ref.type}() method, but "${docName}" contains ${ref.token}. ` +
            `Implement ${ref.type}(name) on the binder.`,
    );
  }
  // Two tokens carry something beside a name: a view pins a version, which is
  // passed as the token has it, and a module pins an alias, defaulted here
  // because an alias ARN needs one.
  let value: string;
  if (ref.type === "view") {
    value = (method as NonNullable<TokenBinder["view"]>).call(binder, ref.name, ref.alias);
  } else if (ref.type === "module") {
    value = (method as NonNullable<TokenBinder["module"]>).call(
      binder,
      ref.name,
      ref.alias ?? DEFAULT_MODULE_ALIAS,
    );
  } else {
    value = (method as (name: string) => string).call(binder, ref.name);
  }
  if (typeof value !== "string") {
    throw new Error(
      `TokenBinder.${ref.type}("${ref.name}") returned ${String(value)} for ${ref.token} ` +
        `in "${docName}". Binder methods must return a string.`,
    );
  }
  return value;
}
