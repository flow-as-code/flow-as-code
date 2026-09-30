[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# flow-as-code

A Connect flow is JSON full of ARNs that differ per account and region. Here
references are tokens, so one document reaches dev and prod through CDK or
Terraform.

Author Amazon Connect flows visually or in typed code, interchangeably, and deploy them through your IaC with references resolved as tokens, never hand-mapped ARNs.

[![The studio: the demo appointment line on the canvas, the block palette on the left, the selected block's parameters on the right, the lint panel clean below](https://flow-as-code.dev/studio-screenshot.png)](https://flow-as-code.dev/studio/)

That editor is running at <https://flow-as-code.dev/studio/>, read-only, on the
flow in the screenshot. No install and no account. The docs are at
<https://flow-as-code.dev/docs/>.

Open-source tooling for Amazon Connect flows: typed flow authoring, lint, simulate-based testing, export, and a visual editor, all round-tripping through one interchange format, with CDK and Terraform/OpenTofu code as outputs.

All packages Apache-2.0, published on npm under the `@flow-as-code` scope; see
[Install](#install) for what to install and
[Packages](#packages) for what each one is. Their pages on the registry:
[core](https://www.npmjs.com/package/@flow-as-code/core),
[cli](https://www.npmjs.com/package/@flow-as-code/cli),
[studio](https://www.npmjs.com/package/@flow-as-code/studio),
[cdk](https://www.npmjs.com/package/@flow-as-code/cdk),
[tf](https://www.npmjs.com/package/@flow-as-code/tf),
[hcl](https://www.npmjs.com/package/@flow-as-code/hcl). The Terraform provider
is [`flow-as-code/flowascode`](https://registry.terraform.io/providers/flow-as-code/flowascode)
on the Terraform Registry and the OpenTofu registry.

## Try it in a browser

The site is live at https://flow-as-code.dev/ and the studio runs read-only at
https://flow-as-code.dev/studio/ . Opening the studio loads the demo
appointment line onto the canvas: eleven blocks, every one a Connect action
this tooling models. A Connect action it does not model renders as a generic
block with its raw JSON rather than being dropped; the `unknown-actions`
conformance fixture and the studio tests hold that, since the demo no longer
carries one. The inspector, the refs sidebar, and the lint panel all work, and
"Export as..." renders the Terraform and CDK output for the document into the
page as text. There is no account, no sign-up, and no save: the build has no
Save button and no FlowDoc download, and it makes no network request after its
own assets load. A reload restores the pristine demo.

The page and the studio artifact are both built from this repository, and
[docs/05-hosted-demo.md](docs/05-hosted-demo.md) records how the build works,
how it is deployed, and how the "loads nothing else" claim is tested.

## Install

Node 22.12 or newer. `@flow-as-code/cli` depends on the other five, so
installing it alone brings the whole set:

```
npm i -D @flow-as-code/cli
```

Name the others in your own manifest when you import from them (the core
builder in your `.flow.ts` files, `FlowSet` from `@flow-as-code/cdk` in your
CDK app). That installs nothing further: the six version together and are
released as a set, so the versions the CLI pulls in already match.

To work on the tools themselves, or to run
[`examples/promote-across-environments/`](examples/promote-across-environments/),
use a clone instead, after which `npx flow-cli` resolves to the workspace copy:

```
git clone https://github.com/flow-as-code/flow-as-code
cd flow-as-code
npm ci && npm run build
```

`@aws-sdk/client-connect` is an optional peer of `@flow-as-code/cli`, needed
only by `export`, `simulate`, and `diff`. `@flow-as-code/cdk` peers on
`aws-cdk-lib ^2.267` and `constructs ^10.8`, also optional: the CLI reaches it
only for its scaffold generator, which loads neither, so a CLI-only install is
25 MB rather than 193 MB. Import `FlowSet` and both peers must be present at
the stated floor; because optional peers draw no install-time warning,
importing `@flow-as-code/cdk` without them throws an error naming both packages
and the floor.

## Quick start

Every command works on a directory of FlowDocs, so `init` comes first: it writes
a demo flow and the typed `.flow.ts` that synthesizes to it, and the rest of the
block operates on that pair. The same block runs after either install above,
from the npm project or from the built clone.

```
npx flow-cli init flows/                # writes appointment-line.{flowdoc.json,flow.ts}
npx flow-cli --help                     # every command, with its flags
npx flow-cli studio flows/              # visual editor over the directory, live-synced
npx flow-cli lint flows/                # the rule set over the whole document set
npx flow-cli codegen flows/appointment-line.flowdoc.json   # FlowDoc -> typed builder TypeScript
npx flow-cli synth flows/appointment-line.flow.ts          # and back
npx flow-cli emit flows/ --target tf    # or --target cdk
```

`init` never replaces a file that is already there; name a different directory
to write a second pair. If nothing above the directory is already a package it
adds a `package.json` marking the pair as modules; inside a project that has one
it leaves yours alone, and the pair loads either way. Edit either side and
`studio` keeps them in step.

Everything but `export`, `simulate`, and `diff` works offline and makes no
network calls. See `packages/cli/README.md` for the exit codes and the
per-command detail.

## The Terraform provider

`flow-as-code/flowascode` manages a flow as a `flowascode_contact_flow`
resource of HCL action blocks. Actions name what they use by key
(`"queue:support"`), and one `refs` map binds each key to a Terraform address
in each environment. The plan lints the flow, a console edit shows as a change
to one action, and existing flows are adopted with `import` or `moved` blocks
rather than recreated. Its source is
[flow-as-code/terraform-provider-flowascode](https://github.com/flow-as-code/terraform-provider-flowascode).

- [Your first flow with the provider](docs/tutorials/01-first-flow.md)
- [Promote a flow from dev to prod](docs/tutorials/02-promote.md)
- [Bring existing flows under Terraform](docs/tutorials/03-adopt.md)
- [Edit a .flow.tf in the studio](docs/tutorials/04-studio.md)
- [The flow cookbook](examples/terraform-provider/cookbook/README.md)

## For AI coding agents

[`plugins/flow-as-code/skills/`](plugins/flow-as-code/skills/) holds Agent
Skills for writing flows as HCL, promoting them, adopting existing ones, and
`flow-cli`, with an action reference generated from the catalog lint reads.
In Claude Code, `/plugin marketplace add flow-as-code/flow-as-code` then
`/plugin install flow-as-code@flow-as-code`.
[docs/07-agent-skills.md](docs/07-agent-skills.md) covers other agents.

## Packages

```
packages/core     Typed builder, synthesizer, codegen, lint engine, FlowDoc interchange, export, simulate client
packages/cdk      CDK token binding (TokenBinder), FlowSet construct, and a `/scaffold` generator
packages/cli      Thin CLI: lint, codegen, synth, render, emit, studio, and the live commands export, simulate, diff
packages/tf       Terraform/OpenTofu emitter: FlowDoc -> .tf + .tftpl files
packages/studio   Visual editor (@xyflow/react) over FlowDoc; served by `flow-cli studio`
packages/hcl      HCL as a third view: the lossless parser and writer behind the .flow.tf companion
plugins/               Agent Skills, and the Claude Code plugin that installs them
conformance/           Cross-language fixtures: the contract for schema, flow language, lint, roundtrip, materialize, emit-tf, export, and simulate
docs/                  FlowDoc spec, studio design, TF emitter design, hosted demo, ADRs
examples/              Runnable walkthroughs, inputs only; the tools generate the rest
tasks/                 Sequenced work items with acceptance criteria
```

[`examples/promote-across-environments/`](examples/promote-across-environments/)
is the sentence at the top as commands you can run: one FlowDoc reaching a dev and a
prod environment on both deploy paths, with no per-environment ARN table. The
CDK path takes no map at all, and the two emitted Terraform trees differ in
exactly one file.

## How the pieces relate

FlowDoc (a JSON document: Flow-language content with `${cdref:type:name}` tokens plus layout and metadata) is the pivot everything converts through:

```
typed TS builder --synth--> FlowDoc --codegen--> typed TS builder   (bidirectional)
studio canvas <--edit--> FlowDoc                                     (direct)
FlowDoc --cdk--> CDK stacks (CloudFormation tokens)                  (deploy path 1)
FlowDoc <--codegen/synth--> .flow.tf (flowascode provider resource) (bidirectional; deploy path 3)
FlowDoc --tf--> .tf + .tftpl files (resource references)             (deploy path 2, one-way)
live instance --export--> FlowDoc (+ codegen to TS or HCL)           (adoption path)
```

So "move between visual building and code" is: the studio edits FlowDoc; `codegen` turns FlowDoc into idiomatic builder TypeScript; `synth` turns builder TypeScript back into FlowDoc. Watch mode keeps both live.
