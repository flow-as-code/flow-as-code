/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// FlowSet: a construct that turns a set of FlowDocs into deployable
// AWS::Connect resources.
//
// Flows become AWS::Connect::ContactFlow and modules become
// AWS::Connect::ContactFlowModule, with content produced by @flow-as-code/core's
// materializeWithBinder and serializeContent so the deployed JSON is
// byte-stable for the same inputs.
// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-connect-contactflow.html
// https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-connect-contactflowmodule.html
//
// Versioning model:
// - Modules are versioned. Each module gets an AWS::Connect::ContactFlowModuleVersion
//   whose logical ID embeds a hash of the module's canonical content, so a
//   content change replaces the version resource and publishes a new immutable
//   version, and an AWS::Connect::ContactFlowModuleAlias per alias name used by
//   the doc set (default "live") whose logical ID is stable and which repoints
//   to the new version. Flows reference the ALIAS ARN, so repointing an alias
//   to a new version changes no flow content.
//   https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-connect-contactflowmoduleversion.html
//   https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-connect-contactflowmodulealias.html
// - Full flows are NOT versioned; their content updates in place. Connect's
//   CreateContactFlowVersion API states: "This API only supports creating
//   versions for flows of type Campaign."
//   https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlowVersion.html
//   (verified 2026-08-31)
//
// References between documents in the set (C06):
// - A `${cdref:flow:name}` whose flow is in the set resolves to that flow's
//   ARN (CfnContactFlow.attrContactFlowArn), with an explicit dependency, the
//   way a module reference resolves to its alias. This is what
//   UpdateContactEventHooks pointing at a whisper or hold flow in the same set
//   needs, and it matches what @flow-as-code/tf and @flow-as-code/hcl do: the
//   set resolves its own documents, the binder (there, the address map) binds
//   the rest. The binder's flow() is not consulted for a flow in the set.
// - Documents are created in dependency order over both kinds of reference,
//   so a referenced flow exists before the flow that references it. A cycle
//   fails at synth with the cycle spelled out: each flow would need the
//   other's ARN, which CloudFormation cannot create in one template, and a
//   "Circular dependency" at deploy would name logical IDs, not flows.
// - A `${cdref:module:name@alias}` whose module is NOT in the set goes to the
//   binder's optional module(name, alias), for a module managed elsewhere and
//   bound per environment; without that method synth fails naming the token
//   and both remedies.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  connectName,
  migrateFlowDoc,
  allRules,
  collectRefs,
  lint,
  materializeWithBinder,
  serializeContent,
  toText,
  type FlowDoc,
  type RefEntry,
} from "@flow-as-code/core";
import type { CfnResource } from "aws-cdk-lib";
import {
  CfnContactFlow,
  CfnContactFlowModule,
  CfnContactFlowModuleAlias,
  CfnContactFlowModuleVersion,
} from "aws-cdk-lib/aws-connect";
import { Construct } from "constructs";

import { DEFAULT_MODULE_ALIAS, bindRef, type TokenBinder } from "./binder.js";

export { DEFAULT_MODULE_ALIAS };

export interface FlowSetProps {
  /** ARN of the Connect instance the flows deploy into. */
  instanceArn: string;
  /**
   * Either a directory containing `*.flowdoc.json` files (read at synth time,
   * sorted by file name) or the documents themselves.
   */
  source: string | FlowDoc[];
  /** Resolves non-module references to CloudFormation-token strings. */
  binder: TokenBinder;
}

/** `name@alias` key for a module alias resource. */
const aliasKey = (name: string, alias: string | undefined): string =>
  `${name}@${alias ?? DEFAULT_MODULE_ALIAS}`;

function loadDocs(source: string | FlowDoc[]): FlowDoc[] {
  if (Array.isArray(source)) return source.map((doc) => migrateFlowDoc(doc, "FlowSet"));
  const files = readdirSync(source)
    .filter((f) => f.endsWith(".flowdoc.json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`FlowSet source directory "${source}" contains no *.flowdoc.json files.`);
  }
  return files.map((f) =>
    migrateFlowDoc(JSON.parse(readFileSync(join(source, f), "utf8")), `FlowSet ${f}`),
  );
}

/** A reference to a document of the same set, which the set resolves itself. */
const inSet = (byName: ReadonlyMap<string, FlowDoc>, ref: RefEntry): boolean =>
  (ref.type === "module" || ref.type === "flow") && byName.get(ref.name)?.kind === ref.type;

/**
 * The set ordered so every document is created after the documents it
 * references: a module after the modules it invokes ("up to five levels" of
 * nesting, per the flow language contract), a flow after the flows its event
 * hooks or transfers name. Stable: modules come before flows, and ties break
 * on name. Throws on a reference cycle, naming it.
 */
function topoSortDocs(docs: FlowDoc[]): FlowDoc[] {
  const byName = new Map(docs.map((d) => [d.name, d]));
  const deps = new Map<string, string[]>(
    docs.map((d) => [
      d.name,
      [
        ...new Set(
          collectRefs(d.content)
            .filter((r) => inSet(byName, r))
            .map((r) => r.name),
        ),
      ].sort(),
    ]),
  );

  const done = new Set<string>();
  const visiting = new Set<string>();
  const ordered: FlowDoc[] = [];
  const visit = (name: string, path: string[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name];
      const kinds = new Set(cycle.map((n) => (byName.get(n) as FlowDoc).kind));
      const label = kinds.size > 1 ? "Flow and module" : kinds.has("module") ? "Module" : "Flow";
      const remedy = kinds.has("flow")
        ? " Each would need the other's ARN, which one CloudFormation template cannot create. " +
          "Deploy one of them from another stack and bind it through the binder's flow()."
        : "";
      throw new Error(`${label} reference cycle: ${cycle.join(" -> ")}.${remedy}`);
    }
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) visit(dep, [...path, name]);
    visiting.delete(name);
    done.add(name);
    ordered.push(byName.get(name) as FlowDoc);
  };
  const byKindThenName = (a: FlowDoc, b: FlowDoc): number =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "module" ? -1 : 1;
  for (const d of [...docs].sort(byKindThenName)) visit(d.name, []);
  return ordered;
}

/**
 * Creates every flow and module in a FlowDoc set on a Connect instance, with
 * references resolved to CloudFormation tokens: a module in the set to the
 * alias ARN this construct manages, a flow in the set to that flow's ARN, and
 * everything else through the user's TokenBinder.
 */
export class FlowSet extends Construct {
  /** Created contact flows, keyed by document name. */
  readonly flows: ReadonlyMap<string, CfnContactFlow>;
  /** Created modules, keyed by document name. */
  readonly modules: ReadonlyMap<string, CfnContactFlowModule>;
  /** Created module aliases, keyed by `name@alias`. */
  readonly moduleAliases: ReadonlyMap<string, CfnContactFlowModuleAlias>;

  constructor(scope: Construct, id: string, props: FlowSetProps) {
    super(scope, id);

    const docs = loadDocs(props.source);
    this.validateDocs(docs);

    const byName = new Map(docs.map((d) => [d.name, d]));

    // Which aliases each module in the set needs: every alias the doc set
    // pins, plus the default so an unreferenced module still deploys with a
    // usable alias. A module outside the set is the binder's to bind.
    const wanted = new Map<string, Set<string>>(
      docs.filter((d) => d.kind === "module").map((d) => [d.name, new Set()]),
    );
    for (const doc of docs) {
      for (const ref of collectRefs(doc.content)) {
        if (ref.type !== "module" || !inSet(byName, ref)) continue;
        (wanted.get(ref.name) as Set<string>).add(ref.alias ?? DEFAULT_MODULE_ALIAS);
      }
    }
    for (const aliases of wanted.values()) {
      if (aliases.size === 0) aliases.add(DEFAULT_MODULE_ALIAS);
    }

    const flows = new Map<string, CfnContactFlow>();
    const modules = new Map<string, CfnContactFlowModule>();
    const aliases = new Map<string, CfnContactFlowModuleAlias>();

    /** The set's own resource a reference resolves to, created already by the order below. */
    const created = (ref: RefEntry, docName: string): CfnResource => {
      const target =
        ref.type === "module" ? aliases.get(aliasKey(ref.name, ref.alias)) : flows.get(ref.name);
      if (target === undefined) {
        // Unreachable: topoSortDocs creates every referenced document first;
        // kept as a guard with a real message.
        throw new Error(`Internal: ${ref.token} not yet created (doc "${docName}").`);
      }
      return target;
    };

    const materializeDoc = (doc: FlowDoc): { content: string; used: CfnResource[] } => {
      const used: CfnResource[] = [];
      const content = materializeWithBinder(doc, (ref: RefEntry): string => {
        if (!inSet(byName, ref)) return bindRef(props.binder, ref, doc.name);
        const target = created(ref, doc.name);
        used.push(target);
        return target instanceof CfnContactFlowModuleAlias
          ? target.attrContactFlowModuleAliasArn
          : (target as CfnContactFlow).attrContactFlowArn;
      });
      return { content: serializeContent(content), used };
    };

    // Dependency order over both kinds: modules before flows unless a module
    // references a flow, and a referenced document before its referrer.
    for (const doc of topoSortDocs(docs)) {
      const { content, used } = materializeDoc(doc);
      if (doc.kind === "flow") {
        // Explicit dependencies: the references inside content already imply
        // the ordering, and this keeps it true even if content is later
        // composed differently.
        const flow = new CfnContactFlow(this, `Flow-${doc.name}`, {
          instanceArn: props.instanceArn,
          name: connectName(doc),
          type: doc.connectType,
          content,
        });
        for (const dep of used) flow.addResourceDependency(dep);
        flows.set(doc.name, flow);
        continue;
      }

      // A module, with its version and aliases.
      const module = new CfnContactFlowModule(this, `Module-${doc.name}`, {
        instanceArn: props.instanceArn,
        name: connectName(doc),
        content,
      });
      for (const dep of used) module.addResourceDependency(dep);
      modules.set(doc.name, module);

      // The version's logical ID embeds the canonical content hash (computed
      // over the doc with its own tokens left in place, so it is stable across
      // processes): a content change replaces the resource, publishing a new
      // immutable version; the alias below keeps a stable logical ID and
      // repoints. See the header comment for the versioning model.
      const discriminator = createHash("sha256")
        .update(serializeContent(materializeWithBinder(doc, (r) => r.token)))
        .digest("hex")
        .slice(0, 8);
      const version = new CfnContactFlowModuleVersion(
        this,
        `Module-${doc.name}-Version-${discriminator}`,
        {
          contactFlowModuleId: module.attrContactFlowModuleArn,
        },
      );
      version.addResourceDependency(module);

      for (const aliasName of [...(wanted.get(doc.name) as Set<string>)].sort()) {
        const alias = new CfnContactFlowModuleAlias(this, `Module-${doc.name}-Alias-${aliasName}`, {
          contactFlowModuleId: module.attrContactFlowModuleArn,
          contactFlowModuleVersion: version.attrVersion,
          name: aliasName,
        });
        alias.addResourceDependency(version);
        aliases.set(aliasKey(doc.name, aliasName), alias);
      }
    }

    this.flows = flows;
    this.modules = modules;
    this.moduleAliases = aliases;
  }

  /** Refuses duplicate names, kind mismatches, and hard lint findings. */
  private validateDocs(docs: FlowDoc[]): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const d of docs) {
      if (seen.has(d.name)) duplicates.add(d.name);
      seen.add(d.name);
      if (d.kind === "module" && d.connectType !== "MODULE") {
        throw new Error(`Module "${d.name}" must have connectType MODULE, got ${d.connectType}.`);
      }
      if (d.kind === "flow" && d.connectType === "MODULE") {
        throw new Error(`Flow "${d.name}" cannot have connectType MODULE.`);
      }
    }
    if (duplicates.size > 0) {
      throw new Error(
        `Duplicate document name(s) in FlowSet: ${[...duplicates].sort().join(", ")}.`,
      );
    }

    // Hard rules block deployment exactly as they block a studio save:
    // no-literal-arn and no-unresolved-token (@flow-as-code/core lint).
    const hard = new Set(allRules.filter((r) => r.hard).map((r) => r.id));
    const blocking = lint(docs).filter((f) => hard.has(f.rule));
    if (blocking.length > 0) {
      throw new Error(`FlowSet refused ${blocking.length} document(s):\n${toText(blocking)}`);
    }
  }
}
