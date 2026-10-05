---
name: flow-cli
description: Use flow-cli (the @flow-as-code/cli package) to work with Amazon Connect flows as FlowDoc files: lint them, generate TypeScript or Terraform companions, synthesize a FlowDoc from a .flow.ts or .flow.tf, convert between companions, emit Terraform or CDK, export or diff a live instance, run simulate scenarios, or open the local studio. Use when a task involves .flowdoc.json, .flow.ts or .flow.tf files, or asks to lint, export, convert or emit flows.
license: Apache-2.0
compatibility: Node.js 22.12 or later. export, diff and simulate need AWS credentials for the instance.
---

# flow-cli

`flow-cli` reads and writes FlowDoc, the JSON interchange format every
flow-as-code tool uses: a Connect flow's content with references as tokens
(`${cdref:queue:support}`), plus layout and metadata. Each document
`<name>.flowdoc.json` has at most one companion source, `<name>.flow.ts`
(typed TypeScript builder) or `<name>.flow.tf` (a `flowascode_contact_flow`
resource).

Install once per project, then run through npx:

```
npm i -D @flow-as-code/cli
```

## Pick the command

| Task                                       | Command                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Start a directory with a demo flow         | `npx flow-cli init flows/ --author tf` (or `--author ts`)                                        |
| Check flows against the rule set           | `npx flow-cli lint flows/` (`--format json` for machine output)                                  |
| Write the companion for a FlowDoc          | `npx flow-cli codegen flows/x.flowdoc.json --to tf` (or `--to ts`)                               |
| Write the FlowDoc from a companion         | `npx flow-cli synth flows/x.flow.tf` (or `x.flow.ts`)                                            |
| Switch a document's companion              | `npx flow-cli convert flows/x.flowdoc.json --to tf`                                              |
| Terraform for the flowascode provider      | `npx flow-cli emit flows/ --target flowascode --address-map refs.dev.tfmap.json --out build/dev` |
| Terraform for hashicorp/aws                | `npx flow-cli emit flows/ --target tf --address-map refs.dev.tfmap.json --out build/dev`         |
| A CDK scaffold                             | `npx flow-cli emit flows/ --target cdk`                                                          |
| Flow language JSON with values filled in   | `npx flow-cli render flows/ --resources map.json`                                                |
| Every flow in a live instance as files     | `npx flow-cli export --instance <ARN> --out flows/ --author tf`                                  |
| Compare files with a live instance         | `npx flow-cli diff flows/ --instance <ARN>`                                                      |
| Run test scenarios against a live instance | `npx flow-cli simulate <scenarios> --instance <ARN>`                                             |
| Edit visually                              | `npx flow-cli studio flows/`                                                                     |

## Behaviour worth knowing

- `lint` exits 1 on any error-severity finding, 0 on warnings alone, and lints
  a directory as one set so rules can follow module references. The provider
  runs the same rules at `terraform plan`.
- `codegen` re-reads an existing companion first: comments marked `@keep`,
  and a `.flow.tf`'s `refs` bindings, `instance_id`, `tags` and `lint` block,
  survive. Output is stable: the same document gives byte-identical code.
- `synth` on a `.flow.tf` parses it in process and never executes anything; on
  a `.flow.ts` it runs the file in a sandboxed child process.
- `convert` prints what the new companion cannot carry (a `.flow.ts` has no
  place for `refs` bindings or `instance_id`) and deletes the old companion
  unless `--keep-old`.
- An address map (`refs.<env>.tfmap.json`) maps each reference key to a
  Terraform address such as `aws_connect_queue.support.arn`. The emitter
  refuses any value matching `arn:aws`. On `--target flowascode` an unmapped
  key is an error naming the key and its documents; `--allow-unbound` writes
  it as `null` under a `# TODO` comment instead. On `--target tf` it is a
  placeholder that fails `validate`. A map key no flow uses is a warning on
  either target, an error with `--strict`.
- `export` writes references as tokens, never ARNs. A flow that refers to
  something the instance's inventory does not list fails by name
  (`--on-error collect`, the default, writes the rest and exits 1).
- `diff` exits 0 when nothing differs, 1 when something does, 2 when the
  comparison failed; layout and metadata are ignored.
- `simulate` respects Connect's TestCase limits: 5 concurrent, 100 in flight,
  5 minutes each.
- `studio` binds 127.0.0.1 on a free port, keeps each document in step with
  its companion in both directions, refuses saves while a hard lint rule
  fails, and makes no network call unless connected to an instance.

## Rules that are not negotiable

- No ARN in a flow's content: `no-literal-arn` is a hard rule. Use reference
  tokens (FlowDoc, TypeScript `Refs.queue("support")`) or keys (HCL
  `"queue:support"`).
- Never hand-edit a generated companion's structure without re-running
  `synth`; edit the companion and let the studio or `synth` update the
  document, or edit the document and run `codegen`.
- An action type the tooling does not model is carried as a `GenericBlock`
  (TypeScript) or `generic` block (HCL) with its parameters unchanged.
