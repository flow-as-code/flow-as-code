/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The CDK stack scaffold, shared by `flow-cli emit --target cdk` and the
// studio's CDK export button.
//
// @flow-as-code/cdk is a library, not a code generator: FlowSet reads the FlowDoc
// directory at synth time, so there is nothing per-document to emit. What a
// user actually has to write by hand is the stack that instantiates it and,
// above all, the TokenBinder, whose method set depends on which reference types
// their documents use. That is what this generates: a valid, compiling starting
// point with a TODO on exactly the binder methods the document set needs.
//
// It lives in the package whose API it writes, and is published as
// `@flow-as-code/cdk/scaffold`, so the CLI and the studio emit the
// same bytes instead of two implementations that drift. The studio cannot
// import the CLI (the CLI depends on the studio for its built assets) and
// parity between the two is the point of the feature, so a shared module is
// the only arrangement that holds.
//
// Pure by contract: no node builtins, no filesystem, no clock, no randomness,
// because this module is bundled into a browser. The one calculation that
// needs a path, the FLOW_DOCS expression, is passed in as `source`: the CLI
// computes it with node:path and the studio with `sourceForDepth` below.
//
// Deterministic: same documents in, byte-identical TypeScript out. Reference
// types and names are sorted, and nothing in the output depends on the order
// files were read.
//
// FlowSet resolves `${cdref:module:...}` itself against the modules it manages,
// so `module` never appears on a binder (packages/cdk/src/binder.ts).

import { type FlowDoc, PACKAGE_NAMES, type RefType, collectRefs } from "@flow-as-code/core";

/** Basename of the file the scaffold is written to. */
export const CDK_SCAFFOLD_FILE = "flow-stack.ts";

/** Required TokenBinder methods, in the order they are emitted. */
const REQUIRED_TYPES = ["hours", "lambda", "lex", "prompt", "queue"] as const;

/** What each binder method must return, echoing packages/cdk/src/binder.ts. */
const RETURNS: Record<string, string> = {
  flow: "ARN of a contact flow not managed by this FlowSet",
  hours: "ARN of the hours of operation, e.g. hours.attrHoursOfOperationArn",
  lambda: "ARN of the Lambda function, e.g. fn.functionArn",
  lex: "ARN of the Lex bot alias",
  prompt: "ARN of the prompt",
  queue: "ARN of the queue, e.g. queue.attrQueueArn",
};

/** What each reference type names, for the comment on an unused method. */
const NOUNS: Record<string, string> = {
  flow: "contact flow",
  hours: "hours of operation",
  lambda: "Lambda function",
  lex: "Lex bot alias",
  prompt: "prompt",
  queue: "queue",
};

/**
 * Reference names per type across the whole set, sorted and deduplicated.
 *
 * A document's `refs` index is the authored answer, but it is derived data and
 * nothing in the schema forces it to be current, so the content is scanned too
 * and the two are unioned. A stale index can therefore only add a binder method
 * the set does not strictly need, never drop one it does.
 */
export function referencedNames(docs: readonly FlowDoc[]): Map<RefType, string[]> {
  const byType = new Map<RefType, Set<string>>();
  for (const doc of docs) {
    for (const ref of [...(doc.refs ?? []), ...collectRefs(doc.content)]) {
      if (ref.type === "module") continue;
      const names = byType.get(ref.type) ?? new Set<string>();
      names.add(ref.name);
      byType.set(ref.type, names);
    }
  }
  return new Map([...byType].map(([type, names]) => [type, [...names].sort()]));
}

/**
 * The FLOW_DOCS expression for an output directory `depth` levels below the
 * directory holding the FlowDocs: `.`, `..`, `../..`. This is what node's
 * `path.relative` produces for the same pair, which is what the CLI passes;
 * packages/studio/tests/exportParity.test.ts compares the two byte for
 * byte on a real `flow-cli emit --target cdk --out` run.
 */
export function sourceForDepth(depth: number): string {
  if (depth <= 0) return ".";
  return Array.from({ length: depth }, () => "..").join("/");
}

function binderMethod(type: string, names: readonly string[]): string[] {
  const returns = RETURNS[type] ?? "ARN of the referenced resource";
  const noun = NOUNS[type] ?? type;
  const head =
    names.length === 0
      ? [`  // No document in this set references a ${noun}.`]
      : [`  // TODO: return the ${returns}.`, `  // Names referenced: ${names.join(", ")}.`];
  return [
    ...head,
    `  ${type}: (name) => {`,
    names.length === 0
      ? `    throw new Error(\`Unexpected ${type} reference "\${name}".\`);`
      : `    throw new Error(\`TODO: bind ${type} "\${name}" to an ARN.\`);`,
    "  },",
  ];
}

export interface CdkScaffoldInput {
  docs: readonly FlowDoc[];
  /**
   * Where FlowSet reads the `*.flowdoc.json` files, relative to the scaffold:
   * `.` when they sit beside it, `..` from a subdirectory. See sourceForDepth.
   */
  source: string;
}

/** The scaffold source. Pure: no filesystem access, no clock, no randomness. */
export function cdkScaffold({ docs, source }: CdkScaffoldInput): string {
  const referenced = referencedNames(docs);
  const types: RefType[] = [...REQUIRED_TYPES];
  // `flow` is optional on TokenBinder, so it is emitted only when it is used.
  if ((referenced.get("flow") ?? []).length > 0) types.unshift("flow");

  const used = [...referenced]
    .filter(([, names]) => names.length > 0)
    .map(([type]) => type)
    .sort();
  const names = docs.map((d) => `${d.kind} ${d.name}`).sort();

  // No licence header: this file lands in a user's project and is theirs, not
  // ours. Same reasoning as codegen's banner (packages/core/src/codegen.ts).
  const lines = [
    "// Generated by `flow-cli emit --target cdk` as a starting point, then yours to",
    "// keep: re-running the command overwrites this file, so move it or rename it",
    "// once you have edited it.",
    "//",
    `// Documents in the set: ${names.join(", ")}.`,
    "//",
    "// FlowSet reads every *.flowdoc.json in the source directory at synth time and",
    "// creates AWS::Connect::ContactFlow and AWS::Connect::ContactFlowModule",
    "// resources, publishing a module version and repointing its alias whenever the",
    `// module content changes. See the ${PACKAGE_NAMES.cdk} README.`,
    "",
    'import { fileURLToPath } from "node:url";',
    "",
    'import { Stack, type StackProps } from "aws-cdk-lib";',
    `import { FlowSet, type TokenBinder } from "${PACKAGE_NAMES.cdk}";`,
    'import type { Construct } from "constructs";',
    "",
    "/**",
    " * Directory holding the FlowDocs. Resolved against this file rather than the",
    " * working directory, so `cdk synth` works from the project root, from here, or",
    " * from anywhere else.",
    " */",
    `const FLOW_DOCS = fileURLToPath(new URL(${JSON.stringify(source)}, import.meta.url));`,
    "",
    "/**",
    " * Resolves each reference token in the documents to a CloudFormation token,",
    ` * normally a construct attribute. ${PACKAGE_NAMES.cdk} inserts what you`,
    " * return byte for byte, so CDK tokens pass through and CloudFormation",
    " * resolves them at deploy time. Never return a literal ARN here.",
    " *",
    used.length === 0
      ? " * These documents contain no references."
      : ` * These documents reference: ${used.join(", ")}.`,
    " */",
    "const binder: TokenBinder = {",
    ...types.flatMap((type) => binderMethod(type, referenced.get(type) ?? [])),
    "};",
    "",
    "export interface FlowStackProps extends StackProps {",
    "  /** ARN of the Amazon Connect instance these flows deploy into. */",
    "  instanceArn: string;",
    "}",
    "",
    "export class FlowStack extends Stack {",
    "  constructor(scope: Construct, id: string, props: FlowStackProps) {",
    "    super(scope, id, props);",
    "",
    '    new FlowSet(this, "Flows", {',
    "      instanceArn: props.instanceArn,",
    "      source: FLOW_DOCS,",
    "      binder,",
    "    });",
    "  }",
    "}",
  ];
  return lines.join("\n") + "\n";
}
