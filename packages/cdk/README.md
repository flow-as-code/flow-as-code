[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# @flow-as-code/cdk

```
npm i @flow-as-code/cdk
```

Apache-2.0, Node 22.12 or newer. Peers on `aws-cdk-lib` and `constructs`, both
optional so a CLI-only install does not fetch them.

Site and docs: <https://flow-as-code.dev/>. This package on npm:
<https://www.npmjs.com/package/@flow-as-code/cdk>.

CDK binding for `@flow-as-code/core`. Two exports, plus a scaffold generator on a subpath:

- `TokenBinder`: an interface you implement, mapping reference names to construct attributes (`queue.attrQueueArn`, `fn.functionArn`, a Lex alias ARN). `@flow-as-code/core`'s `materializeWithBinder` inserts the returned strings byte-for-byte, so CDK tokens pass through and CloudFormation resolves them per account at deploy time. No resource map, no literal ARNs in this path.
- `FlowSet`: a construct consuming a directory of `*.flowdoc.json` files (or `FlowDoc[]`) plus a `TokenBinder`. Flows become `AWS::Connect::ContactFlow` (type from `connectType`), modules become `AWS::Connect::ContactFlowModule`, created in dependency order.

## Usage

```ts
import { FlowSet } from "@flow-as-code/cdk";

new FlowSet(stack, "Flows", {
  instanceArn: instance.attrArn,
  source: "flows/", // or FlowDoc[]
  binder: {
    queue: (name) => queues[name].attrQueueArn,
    hours: (name) => hours[name].attrHoursOfOperationArn,
    lambda: (name) => fns[name].functionArn,
    lex: (name) => lexAliases[name].attrBotAliasArn,
    prompt: (name) => prompts[name].attrPromptArn,
    // flow?: only needed when a doc uses ${cdref:flow:...}
  },
});
```

Module references (`${cdref:module:name@alias}`) are not the binder's job: `FlowSet` resolves them itself, to the alias ARN of the module it manages.

## The scaffold (`@flow-as-code/cdk/scaffold`)

Writing that stack by hand starts with the same file every time, so `cdkScaffold({ docs, source })` generates it: a `FlowStack` constructing a `FlowSet` over the FlowDoc directory, and a `TokenBinder` carrying one `TODO` per reference type the documents actually use, with the referenced names listed. Types the set does not use still get a method, because the interface requires them, but theirs throws instead of carrying a TODO.

The subpath exists because two tools emit this file and must emit it identically: `flow-cli emit --target cdk` and the studio's CDK export button. It is pure and imports no node builtin, so the studio can bundle it for a browser; `source` is the FLOW_DOCS expression (`.`, `..`), which is the one thing that needs a path calculation, and `sourceForDepth` computes it where node's `path.relative` is unavailable. The emitted file resolves that expression against itself with `new URL(source, import.meta.url)`, so the stack reads the same directory whatever the CDK app's working directory is. Output is byte-stable and independent of the order the documents were read.

## Peer dependencies

`aws-cdk-lib ^2.267.0` and `constructs ^10.8.1`, both optional. A project that
has them pinned below that floor gets an ERESOLVE from npm 7 and later rather
than a silent mismatch; a project that has neither installs neither. The floor
is deliberate: `FlowSet` builds `CfnContactFlowModuleVersion` and
`CfnContactFlowModuleAlias` (see the versioning model below), which are recent
additions to `aws-cdk-lib/aws-connect`, and 2.267 is the version this package is
developed and tested against. Lowering it means finding the release that
introduced both L1s and running the `aws-cdk-lib/assertions` tests against it,
not just widening the range.

They are optional because the CDK entry is not the only entry. `@flow-as-code/cli` and
the studio reach this package for `@flow-as-code/cdk/scaffold` alone,
which imports nothing but `@flow-as-code/core`: `aws-cdk-lib` appears in that module as a
line of the stack source it generates, not as an import. Non-optional peers are
auto-installed, so with these declared as ordinary peers every
`npm install @flow-as-code/cli` would fetch 166 MB of CDK that nothing in that
install loads. Importing `FlowSet` or the
binder still needs both packages present, and `tests/packaging.test.ts` holds
the scaffold subpath to its one bare import.

The cost of optional is that npm says nothing at install time, so the package
says it itself. Importing `@flow-as-code/cdk` with `aws-cdk-lib`
absent throws:

```
@flow-as-code/cdk needs the CDK at runtime, but aws-cdk-lib is not
installed. It and constructs are optional peers so that a CLI-only install
stays small, which means npm does not warn about them at install time. Install
them with: npm install aws-cdk-lib@^2.267.0 constructs@^10.8.1
```

The entry checks for the peer before it loads `FlowSet`, so this replaces the
bare `ERR_MODULE_NOT_FOUND` that used to come out of `dist/flow-set.js`. The
`./scaffold` subpath is unaffected and imports with no CDK installed.
`src/index.test.ts` runs the entry in a directory with no `node_modules` and
asserts the message, including the version floor read from `package.json`.

## Versioning model

- Modules are versioned. Each module gets an `AWS::Connect::ContactFlowModuleVersion` whose logical ID embeds a hash of the module's canonical content, so a content change publishes a new immutable version, plus an `AWS::Connect::ContactFlowModuleAlias` per alias name the doc set pins (default `live`) with a stable logical ID that repoints to the new version. Flows reference the alias ARN, so repointing changes no flow content.
- Full flows are not versioned; content updates in place. Connect's `CreateContactFlowVersion` states "This API only supports creating versions for flows of type Campaign." (https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlowVersion.html, verified 2026-08-31)

## Validation

`FlowSet` refuses, at synth time: duplicate document names, `kind`/`connectType` mismatches, references to modules not in the set, module reference cycles, and any document failing a hard `@flow-as-code/core` lint rule (`no-literal-arn`, `no-unresolved-token`). Binder gaps fail with an error naming the token, the document, and the missing method.

No instance/queue provisioning constructs here; users bring their own or use L1s.

## Testing

Offline tests assert on synthesized templates with `aws-cdk-lib/assertions`. The live-deploy test in `src/integration.test.ts` runs only when both `FLOW_TEST_INSTANCE_ARN` and `FLOW_TEST_DEPLOY=1` are set, deploys the demo flow plus a versioned module to that instance through the AWS CLI, and tears the stack down. It writes to the account, so naming an instance is not enough on its own: use an empty sandbox.

That test has run green against a live Connect instance (2026-09-02). The test asserts only that the deploy exited zero, and it deletes the stack in its `finally`, so the content check was a separate step: the same synthesized template was deployed again and left up, and its flows were read back with `DescribeContactFlow` and `DescribeContactFlowModule` and compared against what the FlowDocs materialize to. That comparison is structural rather than byte-for-byte, because deploying resolves each `${cdref:...}` reference to a real ARN: every other position matched exactly, and the reference positions were checked against the stack's own resources instead, each resolving to a resource of the right kind and the module reference resolving to the alias rather than the version. The stack needs no CDK bootstrap: it is asset-free and uses `CliCredentialsStackSynthesizer`. `tasks/A07-flow-cdk.md` records both.
