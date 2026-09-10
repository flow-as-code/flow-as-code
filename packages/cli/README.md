[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# @flow-as-code/cli

Install with `npm i -D @flow-as-code/cli`. Apache-2.0, Node 22.12 or newer.
Installing it brings the other four, so `npx flow-cli` works straight away.
`npx flow-cli init flows` writes a document to open, and `npx flow-cli studio flows`
opens it. [`examples/promote-across-environments/`](https://github.com/flow-as-code/flow-as-code/tree/main/examples/promote-across-environments)
is a worked run of `lint` and `emit` against one document and two environments.

Site and docs: <https://flow-as-code.dev/>. This package on npm:
<https://www.npmjs.com/package/@flow-as-code/cli>.

<!-- src/cli.test.ts parses the first fenced block below and holds it to what
     `flow-cli --help` prints, so keep it first and keep it untagged. -->

```
flow-cli init [dir]                                     scaffold a directory to open
flow-cli lint <dir-or-file> [--format text|json]        rule set over the whole document set
flow-cli render <dir-or-file> --resources map.json      standalone materialization
flow-cli codegen <doc.flowdoc.json> [--out <file.ts>]   FlowDoc -> typed builder TS
flow-cli synth <file.flow.ts> [--out <dir>]             TS -> FlowDoc (sandboxed child process)
flow-cli emit <dir> --target cdk|tf [--address-map refs.tfmap.json]
flow-cli diff <dir> --instance <arn>                     local FlowDocs vs the live instance
flow-cli export --instance <arn> [--out <dir>] [--no-codegen] [--on-error abort|collect]
flow-cli simulate <scenarios> --instance <arn> [--resource-map <file>] [--format junit|json] [--out <file>]
flow-cli studio [dir] [--port <port>]                    local visual editor, live sync both ways
```

## Availability

Every command above is wired, so `--help` is the complete surface; a test in
`src/cli.test.ts` holds `--help` and the usage block above to the same list.

| Command    | Status    | Notes                                                                            |
| ---------- | --------- | -------------------------------------------------------------------------------- |
| `init`     | available | One demo FlowDoc plus its `.flow.ts`; refuses to overwrite                       |
| `lint`     | available | Whole set in one pass, so cross-document rules resolve module references         |
| `codegen`  | available | `@keep` comments in an existing output file survive regeneration                 |
| `synth`    | available | Sandboxed child process; see below                                               |
| `render`   | available | Strict resource map; every unmapped token is listed at once                      |
| `emit`     | available | `--target tf` writes `@flow-as-code/tf` output, `--target cdk` writes a scaffold |
| `export`   | available | Live instance to FlowDoc pairs; collects failures by default                     |
| `simulate` | available | Scenario suite through the TestCase API, JUnit or JSON report                    |
| `diff`     | available | Local documents against the live instance; exit 2 when it cannot tell            |
| `studio`   | available | Local bridge on 127.0.0.1 serving the studio, with live sync both ways           |

Exit codes: 0 on success, 1 for a failure (a missing path, malformed JSON, a
schema-invalid document, an unmapped token, an unknown flag value, a lint
finding with error severity, a flow that could not be exported, a scenario that
did not pass, or a document that differs from the instance). `diff` alone also
uses 2, for an error in the comparison itself, so a script can tell "differs"
from "could not tell".

## Importing it

The command lives in `dist/bin.js` and nothing else loads it, so importing the
package never parses argv or exits the host process. The package root is a
library entry, the union of the three subpaths:

```ts
import { synthFile, createWatcher, startStudioServer } from "@flow-as-code/cli";
// or, narrower:
import { synthFile } from "@flow-as-code/cli/synth";
import { createWatcher } from "@flow-as-code/cli/watch";
import { startStudioServer } from "@flow-as-code/cli/bridge";
```

`src/index.test.ts` imports the built root in a child process and fails if it
writes anything or exits, and holds the root's exports equal to the union of
the three subpaths.

## Connecting to an instance

`export`, `simulate`, and `diff` take `--instance <arn>`, the instance ARN as
the console's account overview shows it
(https://docs.aws.amazon.com/connect/latest/adminguide/find-instance-arn.html).
Only an instance ARN is accepted: a bare instance id carries no Region, and a
resource ARN names the wrong thing.

The Region is read from the ARN. Nothing consults `AWS_REGION` or a profile's
region, so an instance in one Region is never addressed through a client
configured for another
(https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-region.html).

Credentials come from the AWS SDK's default provider chain: environment
variables, the shared config and credentials files with their profiles and SSO
sessions, web identity, and the container and instance metadata endpoints
(https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html).
The CLI takes no credential flags and stores nothing. Pick a profile with
`AWS_PROFILE` as you would for the AWS CLI.

`@aws-sdk/client-connect` is an optional peer dependency, loaded only when one
of these three commands runs, so the offline commands do not pay for it. When
it is not installed the command exits 1 with one line naming the package and
the install command, no stack trace. An SDK that is installed but will not
load (a dependency of its own missing, a broken install) is a different
failure and is reported as `@aws-sdk/client-connect could not be loaded:` with
the loader's reason, since the install command is not the fix. `simulate` also
checks that the installed SDK exposes the TestCase operations, which are
recent, and names the version that has them all when it does not.

Every other command works with no SDK installed and makes no network calls.

## init

`flow-cli init [dir]` writes the smallest complete thing to open, so the npm
path has a first step:

```
npm i -D @flow-as-code/cli
npx flow-cli init flows
npx flow-cli studio flows
```

Three files, into the working directory or `[dir]`:

| File                            | What it is                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| `appointment-line.flowdoc.json` | The demo FlowDoc, the same one the hosted studio demo opens |
| `appointment-line.flow.ts`      | Its paired builder file, generated by `codegen`             |
| `package.json`                  | Only when no `package.json` exists above the directory      |

The pair is written through the same path a canvas save takes, so the document
carries the `meta.sourceHash` of the builder file beside it and the two open in
sync rather than as a conflict on the first edit. The `package.json` declares
`"type": "module"`; a directory that already sits inside a project gets none,
because `synth` evaluates a builder file as ESM whatever the project declares
and there is nothing to fix.

A directory that already holds other files is fine. A directory that already
holds one of the two files this writes is not: nothing is written at all and the
command exits 1 naming every collision, since half a pair is worse than none.

## Input and output conventions

`lint`, `render`, and `emit` take a directory or a single file. A directory
contributes every `*.flowdoc.json` in it, sorted by name, and is not walked
recursively. Every document is validated against `flowdoc-0.1.schema.json`, the
byte copy of `conformance/schema/flowdoc-0.1.schema.json` this package ships,
before any command looks at it, so a malformed document fails with its own path
named rather than deep inside an emitter.

`--out` defaults to the input directory for every command that writes, and
`codegen` names its file after the document (`appointment-line.flowdoc.json`
generates `appointment-line.flow.ts`), which is the inverse of what `synth`
writes.

## lint

The whole document set goes to `@flow-as-code/core`'s lint in one call. Rules
receive the other documents alongside their own, and the ones that follow module
references cannot answer without them: `module-depth-5` on a single file reports
nothing, correctly, because depth is not computable from one document.

`--format json` prints the stable machine-readable report (a `summary` plus
`findings`) on stdout; the failure line goes to stderr, so the JSON stays clean
for a pipe. Exit status follows severity, not count: any `error` exits 1,
warnings alone exit 0.

Every document is schema-checked before any rule runs, so a document the schema
rejects never reaches the report. A literal ARN is the one violation that is
both a schema failure and a named rule, and the schema states it four ways per
field without ever saying "literal ARN", so it is reported once per offending
field as `no-literal-arn: "<field>" contains a literal ARN`. Schema errors the
ARN did not cause are still listed.

## render

Materializes each document with `materializeWithMap` and writes
`<doc name>.json`. This is the one path where a literal ARN is the goal rather
than a mistake, so map values are not linted. Completeness is enforced: a
reference with no entry in the map is fatal, and every missing reference across
every document is printed in one run, each with the key forms it would have
taken.

### Reference map keys

`render --resources`, `simulate --resource-map`, and
`emit --target tf --address-map` read the same shape of file and accept the same
three keys per reference, so one map's keys serve all three:

| Key                           | Where it comes from                                  |
| ----------------------------- | ---------------------------------------------------- |
| `${cdref:module:survey@prod}` | The token, exactly as the document writes it         |
| `module:survey@prod`          | The token without its wrapper                        |
| `module_survey_prod_arn`      | The variable `@flow-as-code/tf` emits in `flow_refs` |

The middle form is what `@flow-as-code/tf` writes into its own TODO comments and
what [`examples/promote-across-environments/`](https://github.com/flow-as-code/flow-as-code/tree/main/examples/promote-across-environments)
uses, and it is the one to prefer: it is the shortest that still says which
resource it means. `render` and `simulate` took only the token before 0.1.2, so
a map written from an emit run was rejected by the next command.

The keys are shared; the values are not. `render` and `simulate` want the ARN of
a resource that exists, and `render` is the one path where a literal ARN is the
goal rather than a mistake. `emit --target tf --address-map` wants an HCL address
expression and refuses a literal ARN, because an emitted flow that hardcodes one
is the thing this tooling exists to stop. So a `render` map and an `emit` map are
two files with the same keys.

## emit

`--target tf` is a thin wrapper over `@flow-as-code/tf`, writing exactly
the bytes the emitter returns and nothing of its own. `--address-map` is passed
through as `options.addressMap` and takes the same three key forms
("Reference map keys" above); without one, unresolved references become the
emitter's loud `TODO_MISSING_ADDRESS_*` placeholders, which fail
`terraform validate` rather than deploying a broken flow.

`--target cdk` is not a code generator, because `@flow-as-code/cdk` is a
library: `FlowSet` reads the FlowDoc directory itself at synth time. What the
command writes is `flow-stack.ts`, a compiling scaffold that constructs a
`FlowSet` over the directory and declares a `TokenBinder` carrying one `TODO`
per reference type the documents actually use, with the referenced names listed.
Reference types the set does not use still get a method, because `TokenBinder`
requires them, but theirs throws instead of carrying a TODO. Module references
never appear: `FlowSet` resolves those itself against the modules it manages.
Re-running the command overwrites the file, so move or rename it once you have
filled it in.

The generator lives in `@flow-as-code/cdk/scaffold`, not here, because the
studio's CDK export button has to produce the same bytes and cannot import this
package (`@flow-as-code/cli` depends on `@flow-as-code/studio` for its built
assets). What stays here is the path arithmetic: turning `--out` and the
documents' directory into the relative `FLOW_DOCS` expression. The scaffold
resolves that expression against its own file (`new URL(..., import.meta.url)`),
so `cdk synth` works from the project root, where `cdk.json` normally lives, and
not only from the directory the scaffold was written to.

## synth

`flow-cli synth <file.flow.ts> [--out <dir>]` evaluates a TypeScript builder
file and writes one `<flow.name>.flowdoc.json` per flow it exports, into
`--out` or, by default, next to the source file. A flow is any exported `Flow`
instance and the result of any exported zero-argument function that returns one.
Output is byte-stable (`@flow-as-code/core`'s canonical serializer) and carries
`meta.generator` (`cli@<version>`) and `meta.sourceHash` (`sha256:<hex>` of the
source file bytes).

A builder file does not need `@flow-as-code/core` installed beside it. The child
resolves that import normally first, so a copy in the file's own `node_modules`
wins; only when nothing resolves does it fall back to the copy flow-cli itself
is running against. That is what lets a folder holding nothing but FlowDocs and
the `.flow.ts` files `codegen` wrote next to them synth at all. The fallback
covers `@flow-as-code/core` and nothing else, so a builder file cannot reach the
rest of `@flow-as-code/cli`'s dependencies through it.

The builder file itself is evaluated as ES module source whatever the enclosing
`package.json` says, including an explicit `"type": "commonjs"` (which is what
`npm init -y` writes). That is what codegen emits and the only module system
that can import `@flow-as-code/core`, which ships ES modules only. The override
covers that one file and not the project: a module the builder imports keeps
its project's module system, so in a CommonJS project a helper `.ts` that
imports `@flow-as-code/core` still fails, and synth says so by name. Set
`"type": "module"` in the nearest `package.json`.

The builder file never runs in the CLI process. It runs in a child node with
tsx registered via `--import`, a stripped environment (PATH plus a private
temp dir for tsx), and cwd pinned to the source directory. Where the runtime
has the stable `--permission` flag (Node 22.13+), Node's permission model is
enabled: file writes are denied everywhere except tsx's private temp dir (the
parent process writes the FlowDocs), and child processes are denied. File
reads are not jailed, and on Node 22/24 the permission model does not cover
network access at all; see the header comment in `src/synth.ts` for exactly
what is and is not enforced, with citations.

## diff

`flow-cli diff <dir> --instance <arn>` answers whether what is checked in
matches what is deployed. Every `*.flowdoc.json` in `<dir>` is validated and
paired with the live flow or module of the same kind and name, where the live
name is the slug `export` derives from the console name. The live side goes
through the same exporter, so it carries tokens rather than ARNs, and the two
documents are compared as canonical JSON with `layout` and `meta` removed:
positions and provenance are not differences anyone deploys.

One line per local document, in path order, then a unified diff of the
canonical JSON under each changed one:

```
flows/appointment-line.flowdoc.json: changed
--- local/flows/appointment-line.flowdoc.json
+++ live/appointment-line
@@ -13,7 +13,7 @@
...
flows/recording-consent.flowdoc.json: unchanged
flows/callback-offer.flowdoc.json: missing-live
```

Live flows with no local document are not reported. The same two states
always print the same bytes, so the output can be compared across runs.

A live flow that has never been published has no published content, so the
exporter reads its saved content through the `$SAVED` alias, the same way
`export` does. The line says so, `flows/draft-line.flowdoc.json: unchanged
($SAVED)`, and a diff under it is labelled `+++ live/draft-line:$SAVED`.
Unchanged against a draft means the draft matches, not that anything is
deployed.

Exit 0 when nothing differs, 1 when any document is changed or has no live
counterpart, and 2 when the comparison itself failed: bad arguments (a missing
`--instance` or an unknown flag included, where every other command exits 1),
the SDK not installed, the instance unreadable, or a matched live flow the
exporter could not convert (that document prints as `error:` with the reason,
and the run still reports the rest).

## export

`flow-cli export --instance <arn> [--out <dir>] [--no-codegen] [--on-error abort|collect]`
reads every flow and module in the instance and writes `<name>.flowdoc.json`
plus `<name>.flow.ts` for each into `--out`, which defaults to the working
directory and is created if needed. `--no-codegen` writes the documents only.
References come out as tokens, never ARNs, and the name is the slug the
exporter derives from the console name (`Appointment Line` becomes
`appointment-line`). A flow and a module that slug to the same name would
share a file name; the second one is reported as a failure rather than
overwriting the first.

Each pair is written the way `synth` and the studio write it: the document
carries `meta.sourceHash` of the generated source, so the watch engine sees an
exported pair as in sync, and an existing `<name>.flow.ts` is read first so
its `@keep` comments survive, as with `codegen`. A flow that has never been
published is read through the documented `$SAVED` alias and marked as such in
the summary.

stdout carries one line per document written and a closing count; stderr
carries the exporter's warnings (`warning: ...`, for content it had to skip or
could not fully represent) and one `failed: <name> (<arn>): <reason>` line per
flow it could not export.

```
appointment-line (flow): appointment-line.flowdoc.json, appointment-line.flow.ts
recording-consent (module): recording-consent.flowdoc.json, recording-consent.flow.ts
Exported 2 of 3 to /work/flows
```

`--on-error` defaults to `collect`, which writes everything that exported and
reports every failure at once. `abort` stops at the first failure and writes
nothing. The default is collect because a fresh instance always holds the
stock "Sample Lambda integration" flow, which calls a Lambda in an AWS-owned
account that the instance's Lambda list cannot return; that is an unknown-ARN
hard error by design (see the Export section of `packages/core/SPEC.md`),
and aborting on it would make a first export of any new instance write
nothing. Either mode exits 1 when any flow failed.

`--on-error` governs flows only. The inventory listing that precedes them
(flows, modules, queues, hours, prompts, Lambda functions, bots) fails in
either mode with the SDK's own message, an `AccessDeniedException` naming the
missing action for instance, and nothing is written.

## simulate

`flow-cli simulate <scenarios> --instance <arn> [--resource-map <file>] [--format junit|json] [--out <file>]`
runs a scenario suite through the instance's TestCase operations
(https://docs.aws.amazon.com/connect/latest/adminguide/testing-simulation-execute-test-cases.html)
within the documented limits, 5 concurrent, 100 in flight, 5 minutes per
scenario, and writes a report.

`<scenarios>` is one scenario file, or a directory. A directory contributes
every `scenario.json` and `*.scenario.json` directly in it and one level down,
which is the layout of `conformance/simulate/` (one `scenario.json` per case
directory); other files are ignored.

Everything that can fail offline fails before the instance is touched, and
all at once. Every scenario is validated against `scenario-0.1.schema.json`,
the byte copy of `conformance/schema/scenario-0.1.schema.json` this package
ships, then against the cross-field rules the schema cannot express, and every
`${cdref:...}` token in the suite is resolved through `--resource-map`, a JSON
object from reference to ARN in the same shape `render` takes, with the same
three key forms ("Reference map keys" above). A suite with one broken scenario
or one unmapped reference creates no test case.

The report goes to stdout, or to `--out`, in which case the path is printed
instead. `--format junit` (the default) is the `<testsuites>` document CI
systems ingest; `--format json` is the stable `flow-simulate-report/0.1`
document. Scenarios that did not pass are also described on stderr, one block
per scenario with the failed observations, so a CI log says why without
opening the report.

Exit 0 only when every scenario `PASSED`. `FAILED`, `TIMED_OUT` (the harness
stops the execution when the 5 minutes are up), `STOPPED`, and `ERRORED` (an
API error for that scenario) each exit 1, and the summary line says how many
of the suite did not pass.

## watch (library)

`@flow-as-code/cli/watch` exports `createWatcher(dir)`, the engine
behind studio sync (A11). It watches one directory (non-recursive) and pairs
`<name>.flow.ts` with `<name>.flowdoc.json` by base name. On a ts change it
re-synths in the same sandboxed child and rewrites the doc, guarded by
`meta.sourceHash` (docs/01-flowdoc-spec.md, invariant 3): if the doc on disk
was edited externally since the watcher last wrote or observed it, and that
edit does not carry the previous ts content's hash, the pair is dirty on both
sides. The watcher then emits `conflict` and writes nothing. A pair that is
already diverged when the watcher starts also gets a `conflict` rather than
an overwrite.

The re-synth uses the same resolution rules `synth` documents above, so a
watched directory needs no `node_modules` of its own for the builder files in
it to resolve `@flow-as-code/core`.

Events: `synced {tsPath, docPath, name}`, `conflict {tsPath, docPath, name,
reason}`, `error {path, message}`, plus a `ready` convenience event after the
initial scan settles. A ts file whose flow names do not include the file's
base name syncs only when it exports exactly one flow; otherwise the watcher
emits `error` for that pair.

A change that leaves the builder file byte-identical to the last synced content
is normally silent (it is how the watcher recognizes its own writes), with one
exception: when the preceding change ended in `error`, the same no-op emits
`synced`. Undoing a broken edit is the ordinary way to fix one, and consumers
latch the error, so without that event the studio's out-of-sync badge outlived
the state it reported and cleared only on some later, unrelated edit.

`noteWrite(name, {tsContent, docContent})` records a pair another part of the
same process just wrote as the clean baseline, so the studio bridge's own
writes are not read back as external edits. Pass the exact bytes written, and
call it after both files are on disk.

## studio

`flow-cli studio [dir] [--port <port>]` serves the visual editor over a
directory of FlowDocs and builder files, with live sync in both directions. It
prints the URL to open; `dir` defaults to the working directory and the port
defaults to a free one.

A document with no `<name>.flow.ts` beside it gets one written before the
server starts, and the command prints a line per file:

```
wrote    appointment-line.flow.ts from appointment-line.flowdoc.json
```

That is the same `codegen` the canvas runs on save, so the bytes are the ones
the first save would have written, and the document is stamped with the
`meta.sourceHash` of the source just generated. Without it a directory holding
only documents (exported from an instance, copied out of `conformance/`, sent
by a colleague) had no builder file to edit, so the loop this command exists
for could not start there. An existing builder file is never overwritten. A
document `codegen` refuses is named and skipped, and the rest of the directory
still opens:

```
skipped  broken.flowdoc.json: broken.flowdoc.json is not a valid FlowDoc: ...
```

A builder file the watcher cannot synth is reported on the same stream:

```
error    appointment-line.flow.ts: Evaluating /w/appointment-line.flow.ts threw: Transform failed with 1 error:
/w/appointment-line.flow.ts:101:16: ERROR: Unexpected ";"
```

Stack frames inside `node_modules` and node's own internals are dropped from
that message. A transform failure carries ten frames of esbuild and stream
internals under a line that already names the file, line and column, and the
studio's badge shows only the first line for the same reason. Frames in files
you wrote survive, because a runtime throw inside a flow needs them. There is
no switch that restores the dropped frames. `node_modules` has to be a whole
path segment of the frame's own location for the frame to count as vendor code,
so a project under a directory called `node_modules-sandbox`, or a function
named `loadNodeModules`, keeps its frames.

A pair assembled by hand is a different case and still reports a conflict: the
document has to carry the `meta.sourceHash` of the source next to it, or the
watcher has no evidence the two ever agreed. `flow-cli synth <name>.flow.ts`
writes that stamp; removing the stale side works too.

The server binds `127.0.0.1` and only `127.0.0.1`. This process writes files
you own, so a bridge reachable from the network would be a remote file writer;
the bind address is not configurable for that reason. Binding loopback is not
by itself protection against DNS rebinding (a page on the internet can resolve
its own hostname to 127.0.0.1), so the `Host` header is checked as well and a
request addressed to anything else is refused. No CORS headers are sent, and
the server makes no outbound connections.

What it serves: the built studio assets from the installed
`@flow-as-code/studio` package, and a small JSON API under `/bridge`.
If the studio package is present but has not been built, the command says so
and names the build command.

The API is these six routes and nothing else; anything else under `/bridge`
answers 404 with the method and path it was given
(`src/bridge/server.ts`):

| Route                         | Method | What it does                                         |
| ----------------------------- | ------ | ---------------------------------------------------- |
| `/bridge/info`                | GET    | Served directory, version, and the session token     |
| `/bridge/docs`                | GET    | Names of the documents in the served directory       |
| `/bridge/docs/<name>`         | GET    | One pair: the FlowDoc and its `<name>.flow.ts`       |
| `/bridge/docs/<name>`         | PUT    | Save that pair; 409 when the pair diverged           |
| `/bridge/docs/<name>/resolve` | POST   | Settle a refused save by choosing a side             |
| `/bridge/export`              | POST   | Write an emitted file map under the served directory |
| `/bridge/events?cursor=<n>`   | GET    | Long-polled watch events from `<n>` on               |

Every request to `/bridge` and to the document itself carries the session
token, either as the `token` query parameter (which is how the printed URL
opens the page) or as the `x-flow-studio-token` header (which is how the page's
own calls send it). Subresources are served without one so the token never
appears in an asset URL. `src/bridge/forgery.test.ts` holds this contract,
along with the `Sec-Fetch-Site` and `Origin` checks described above.

`POST /bridge/export` is how the studio's export buttons reach disk: the studio
emits the file map (the same emitters this CLI's `emit` and `render` use) and
this process writes it under the served directory. Paths are checked against
the protocol's path rule and then again by resolving them and requiring the
result to be inside that directory. Nothing is paired and no event is
published: emitted terraform and CDK files are output, not documents.

Saving from the canvas writes both halves of the pair: the FlowDoc, and
`<name>.flow.ts` regenerated with `codegen`, passing the existing file so
`@keep` comments survive. The document is stamped with `meta.sourceHash` of
the source just written, which is what keeps the watcher from reading the
save as a divergence.

Conflicts are never merged. A save whose builder file has changed since the
document was generated from it is refused with 409 and both sides are offered
in the studio's dialog; so is a pair the watcher finds diverged on disk. Every
write stays refused until the choice is made.
