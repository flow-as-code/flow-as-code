/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The model behind the two map editors in the export dialog: the terraform
// address map and the raw resource map.
//
// The two maps look alike and are opposites. A terraform address is an HCL
// expression that resolves to an ARN at apply time, so a literal ARN is
// rejected there exactly as the ref pickers reject one in a parameter
// (docs/01-flowdoc-spec.md: references stay references). A resource map value
// IS the ARN, because raw export is the one path whose output is deployable
// Flow language rather than IaC (packages/core/SPEC.md, Materialization).
//
// "Which references still have no address?" is asked of the emitter rather
// than answered here. @flow-as-code/tf resolves some references from the document set
// itself, so a `${cdref:module:survey@prod}` whose module is in the set needs
// no map entry at all, and a second implementation of that rule would be a
// second implementation to keep in step. Instead the emitter runs and the
// TODO comments it writes into flow_refs.tf are read back, the same
// use-the-real-thing-as-an-oracle arrangement as src/model/demotion.ts.

import type { FlowDoc, RefEntry, RefType } from "@flow-as-code/core";
import { collectRefs, refKey } from "@flow-as-code/core";
import { emitTf } from "@flow-as-code/tf/emit";
import { LITERAL_ARN } from "../model/refValues.js";

// `queue:front-desk`, `module:survey@prod`: the token without its wrapper. Was
// a byte-identical second copy of @flow-as-code/core's, which is the authority:
// the same three key forms now decide what `emit --address-map`, `render
// --resources` and `simulate --resource-map` accept, so a second spelling of
// one of them would be a way for the editor to offer a key the CLI rejects.
export { refKey };

export interface ExportRef extends RefEntry {
  /**
   * The key this reference takes in the address map. @flow-as-code/tf accepts the token,
   * this body form, or the generated variable name; the body form is the one
   * the conformance cases and the CLI's `--address-map` files use.
   */
  key: string;
  /** Names of the documents that use it, sorted. */
  docs: string[];
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @flow-as-code/tf's identifier form, mirrored: hyphens become underscores and a
 * leading digit takes an underscore prefix, because terraform identifiers may
 * not begin with one (docs/03-tf-emitter.md). Mirrored rather than imported
 * because this produces a placeholder, not an address; nothing depends on the
 * two staying identical.
 */
const ident = (slug: string): string => {
  const underscored = slug.replaceAll("-", "_");
  return /^[0-9]/.test(underscored) ? `_${underscored}` : underscored;
};

/**
 * The terraform address a reference of this type usually takes.
 *
 * Every resource named here exports `arn`, checked against the AWS provider
 * docs on 2026-09-02:
 *   aws_connect_queue
 *     https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/connect_queue
 *   aws_connect_hours_of_operation
 *     https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/connect_hours_of_operation
 *   aws_connect_contact_flow, aws_connect_contact_flow_module
 *     https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/connect_contact_flow
 *   aws_lambda_function
 *     https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function
 *   data.aws_connect_prompt, because prompts are uploaded rather than declared
 *     https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/connect_prompt
 *
 * Lex V2 is the exception: aws_lexv2models_bot exports only `id`
 * (https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lexv2models_bot),
 * so the hint is a variable rather than an attribute that does not exist.
 */
const ADDRESS_SHAPE: Readonly<Record<RefType, (name: string) => string>> = {
  queue: (n) => `aws_connect_queue.${n}.arn`,
  hours: (n) => `aws_connect_hours_of_operation.${n}.arn`,
  lambda: (n) => `aws_lambda_function.${n}.arn`,
  prompt: (n) => `data.aws_connect_prompt.${n}.arn`,
  flow: (n) => `aws_connect_contact_flow.${n}.arn`,
  module: (n) => `aws_connect_contact_flow_module.${n}.arn`,
  lex: (n) => `var.${n}_bot_alias_arn`,
};

/**
 * What the address field for this reference suggests. A hint and nothing more:
 * any expression checkAddress accepts is valid, and a reference may equally
 * resolve through a data source, a module output, or a variable.
 *
 * Every row used to suggest `aws_connect_queue.front_desk.arn`, which told an
 * hours or lambda row's reader the wrong resource type and the wrong name.
 */
export function addressPlaceholder(entry: RefEntry): string {
  const name = entry.alias === undefined ? entry.name : `${entry.name}-${entry.alias}`;
  return ADDRESS_SHAPE[entry.type](ident(name));
}

/** Every reference in the document set, deduplicated and sorted by token. */
export function exportRefs(docs: readonly FlowDoc[]): ExportRef[] {
  const found = new Map<string, ExportRef>();
  for (const doc of docs) {
    for (const entry of collectRefs(doc.content)) {
      const existing = found.get(entry.token);
      if (existing === undefined) {
        found.set(entry.token, { ...entry, key: refKey(entry), docs: [doc.name] });
      } else if (!existing.docs.includes(doc.name)) {
        existing.docs.push(doc.name);
      }
    }
  }
  for (const ref of found.values()) ref.docs.sort(byString);
  return [...found.values()].sort((a, b) => byString(a.token, b.token));
}

/**
 * The line @flow-as-code/tf writes into flow_refs.tf for a reference it has no address
 * for. Reading it back is how this module knows what is still missing without
 * restating the emitter's resolution rules; tests/exportRefMap.test.ts pins the
 * marker, so a change to the emitter's wording fails a test rather than
 * silently reporting nothing missing.
 */
const MISSING_MARKER = /TODO: no terraform address for (\S+?)\.$/gm;

/**
 * Tokens the emitter still has no address for, asked of the emitter.
 *
 * This computes bytes and throws them away: nothing leaves the studio, so it
 * deliberately does not run the save gate. Emitting the export itself does
 * (src/export/targets.ts).
 */
export function unmappedTokens(
  docs: readonly FlowDoc[],
  addressMap: Record<string, string>,
): string[] {
  const refs = emitTf(docs, { addressMap }).files["flow_refs.tf"] ?? "";
  return [...refs.matchAll(MISSING_MARKER)].map((m) => m[1] ?? "").sort(byString);
}

export type MapValueCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Inline validation for one terraform address. Mirrors @flow-as-code/tf's own
 * `checkExpression`, which is the authority and refuses the same values at
 * emit time; this is the half that says so while the user is typing, exactly
 * as RefPicker mirrors the no-literal-arn lint rule.
 */
export function checkAddress(raw: string): MapValueCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter a terraform address, or leave it unmapped." };
  // Two patterns, because the two sides differ at the edges: the studio's is
  // the lint rule's (`arn:aws-us-gov:`), @flow-as-code/tf's is looser (`arn:aws`), and
  // an address has to satisfy both to survive emission.
  if (LITERAL_ARN.test(value) || /arn:aws/i.test(value)) {
    return {
      ok: false,
      error:
        "Literal ARNs are rejected (lint rule no-literal-arn). Use a terraform address such " +
        "as aws_connect_queue.front_desk.arn.",
    };
  }
  if (/[\n\r]/.test(value)) return { ok: false, error: "An address is a single line of HCL." };
  if (/#|\/\/|\/\*/.test(value)) {
    return { ok: false, error: "An address may not contain a comment marker." };
  }
  return { ok: true, value };
}

/**
 * Inline validation for one resource map value. The opposite rule: this is
 * where an ARN belongs, so only emptiness is refused.
 */
export function checkResourceValue(raw: string): MapValueCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter the resolved value for this reference." };
  return { ok: true, value };
}

/** Drops empty entries, so a half-typed row is "unmapped" rather than "". */
export function compactMap(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(map)
      .map(([key, value]): [string, string] => [key, value.trim()])
      .filter(([, value]) => value !== "")
      .sort(([a], [b]) => byString(a, b)),
  );
}
