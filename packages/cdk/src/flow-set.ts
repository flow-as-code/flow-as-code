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

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  allRules,
  collectRefs,
  lint,
  materializeWithBinder,
  serializeContent,
  toText,
  type FlowDoc,
  type RefEntry,
} from "@flow-as-code/core";
import {
  CfnContactFlow,
  CfnContactFlowModule,
  CfnContactFlowModuleAlias,
  CfnContactFlowModuleVersion,
} from "aws-cdk-lib/aws-connect";
import { Construct } from "constructs";

import { bindRef, type TokenBinder } from "./binder.js";

/** Alias created for a module no flow pins to a named alias. */
export const DEFAULT_MODULE_ALIAS = "live";

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
  if (Array.isArray(source)) return [...source];
  const files = readdirSync(source)
    .filter((f) => f.endsWith(".flowdoc.json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`FlowSet source directory "${source}" contains no *.flowdoc.json files.`);
  }
  return files.map((f) => JSON.parse(readFileSync(join(source, f), "utf8")) as FlowDoc);
}

/**
 * Modules ordered so every module is created after the modules it references
 * ("up to five levels" of nesting, per the flow language contract). Stable:
 * ties break on name. Throws on a reference cycle, which Connect could never
 * execute anyway.
 */
function topoSortModules(modules: FlowDoc[]): FlowDoc[] {
  const byName = new Map(modules.map((m) => [m.name, m]));
  const deps = new Map<string, string[]>(
    modules.map((m) => [
      m.name,
      collectRefs(m.content)
        .filter((r) => r.type === "module" && byName.has(r.name))
        .map((r) => r.name)
        .sort(),
    ]),
  );

  const done = new Set<string>();
  const visiting = new Set<string>();
  const ordered: FlowDoc[] = [];
  const visit = (name: string, path: string[]): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Module reference cycle: ${[...path, name].join(" -> ")}.`);
    }
    visiting.add(name);
    for (const dep of deps.get(name) ?? []) visit(dep, [...path, name]);
    visiting.delete(name);
    done.add(name);
    ordered.push(byName.get(name) as FlowDoc);
  };
  for (const m of [...modules].sort((a, b) => a.name.localeCompare(b.name))) visit(m.name, []);
  return ordered;
}

/**
 * Creates every flow and module in a FlowDoc set on a Connect instance, with
 * references resolved to CloudFormation tokens: non-module refs through the
 * user's TokenBinder, module refs to the alias ARN of the module this
 * construct manages.
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

    const moduleDocs = docs.filter((d) => d.kind === "module");
    const flowDocs = docs
      .filter((d) => d.kind === "flow")
      .sort((a, b) => a.name.localeCompare(b.name));
    const moduleNames = new Set(moduleDocs.map((d) => d.name));

    // Which aliases each module needs: every alias the doc set pins, plus the
    // default so an unreferenced module still deploys with a usable alias.
    const wanted = new Map<string, Set<string>>(moduleDocs.map((d) => [d.name, new Set()]));
    for (const doc of docs) {
      for (const ref of collectRefs(doc.content)) {
        if (ref.type !== "module") continue;
        if (!moduleNames.has(ref.name)) {
          throw new Error(
            `"${doc.name}" references ${ref.token}, but no module named "${ref.name}" is in this FlowSet.`,
          );
        }
        (wanted.get(ref.name) as Set<string>).add(ref.alias ?? DEFAULT_MODULE_ALIAS);
      }
    }
    for (const aliases of wanted.values()) {
      if (aliases.size === 0) aliases.add(DEFAULT_MODULE_ALIAS);
    }

    const flows = new Map<string, CfnContactFlow>();
    const modules = new Map<string, CfnContactFlowModule>();
    const aliases = new Map<string, CfnContactFlowModuleAlias>();

    const materializeDoc = (
      doc: FlowDoc,
    ): { content: string; used: CfnContactFlowModuleAlias[] } => {
      const used: CfnContactFlowModuleAlias[] = [];
      const content = materializeWithBinder(doc, (ref: RefEntry): string => {
        if (ref.type !== "module") return bindRef(props.binder, ref, doc.name);
        const alias = aliases.get(aliasKey(ref.name, ref.alias));
        if (alias === undefined) {
          // Unreachable for modules (topological order) and flows (created
          // after every module); kept as a guard with a real message.
          throw new Error(`Internal: alias for ${ref.token} not yet created (doc "${doc.name}").`);
        }
        used.push(alias);
        return alias.attrContactFlowModuleAliasArn;
      });
      return { content: serializeContent(content), used };
    };

    // Modules first, dependency-ordered, each with its version and aliases.
    for (const doc of topoSortModules(moduleDocs)) {
      const { content, used } = materializeDoc(doc);
      const module = new CfnContactFlowModule(this, `Module-${doc.name}`, {
        instanceArn: props.instanceArn,
        name: doc.name,
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

    // Then flows. Alias references inside content already imply the ordering;
    // the explicit dependency keeps it true even if content is later composed
    // differently.
    for (const doc of flowDocs) {
      const { content, used } = materializeDoc(doc);
      const flow = new CfnContactFlow(this, `Flow-${doc.name}`, {
        instanceArn: props.instanceArn,
        name: doc.name,
        type: doc.connectType,
        content,
      });
      for (const dep of used) flow.addResourceDependency(dep);
      flows.set(doc.name, flow);
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
