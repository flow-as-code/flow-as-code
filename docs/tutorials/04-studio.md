# Edit a .flow.tf in the studio

A flow authored for the Terraform provider does not have to be edited as HCL.
Every flow-as-code flow is a FlowDoc, and a FlowDoc has one companion source
file, `<name>.flow.ts` (typed TypeScript) or `<name>.flow.tf` (the provider's
resource). The studio, the visual editor, keeps the document and its
companion in step in both directions: move a block on the canvas and the
`.flow.tf` is rewritten; edit the `.flow.tf` and the canvas follows within a
second.

This tutorial needs `@flow-as-code/cli` 0.2.0 or later and Node 22.12 or
later. Outputs are from a run on 2026-09-29; the CLI prints absolute paths,
shortened here to `flows/...`.

## Step 1: start a flow authored in HCL

```
npm i -D @flow-as-code/cli
npx flow-cli init flows/ --author tf
```

```
flows/appointment-line.flow.tf
flows/appointment-line.flowdoc.json
```

`init` writes a small demo flow as a FlowDoc and its `.flow.tf`. To work on
flows you already have, `flow-cli export --author tf` writes the same pair for
every flow in an instance ([Bring existing flows under Terraform](03-adopt.md)),
and `flow-cli codegen <doc> --to tf` writes the `.flow.tf` for a FlowDoc you
already have.

```
npx flow-cli lint flows/
```

```
No findings.
```

`lint` runs the same rules the provider runs at plan time, on the documents,
with no AWS account and no Terraform.

## Step 2: open the studio

```
npx flow-cli studio flows/
```

The studio opens in your browser on the directory. The toolbar badges the
open document's companion (`.flow.tf`), and the lint panel shows the same
findings `flow-cli lint` prints, including any rules the `.flow.tf` switches
off in its `lint` block. The studio works offline; it makes no network call
unless you connect it to an instance.

## Step 3: edit on the canvas

Drag a block, add an action from the palette, or change a message in the
inspector, and save. The studio refuses a save while a hard lint rule fails,
and otherwise writes the FlowDoc and regenerates `appointment-line.flow.tf`.

Regeneration writes the structure from the document and keeps what only the
`.flow.tf` knows:

- the `refs` bindings, by key (a key no action uses any more is dropped; a new
  key is written as `null` under a `# TODO` line, which the provider refuses at
  plan time until you bind it);
- `instance_id`, `tags`, `state`, the `lint` block, `depends_on`, `provider`
  and `lifecycle`;
- comments marked `@keep` directly above an action block or above the
  resource.

So bindings written for an environment survive a canvas edit:

```hcl
  refs = {
    "hours:main-line"           = var.main_line_hours_arn
    "lambda:appointment-lookup" = var.appointment_lookup_arn
    "queue:appointments"        = var.appointments_queue_arn
  }
```

That is how `examples/terraform-provider/flows/` works: the directory is a
Terraform module and a studio directory at once.

A block keeps its canvas position in a `position { x y }` block only when it
is somewhere other than where the automatic layout would put it, so a flow
nobody has dragged has no positions in its `.flow.tf` at all.

## Step 4: edit the HCL

Edit `appointment-line.flow.tf` in your editor, for example the welcome text:

```hcl
    message_participant {
      text = "Thanks for calling Example Clinic."
    }
```

and save. The canvas re-syncs within a second. If the file does not parse,
or breaks a contract rule (an ARN where a key belongs, two typed blocks in one
action), the studio says which line and keeps the last good canvas.

Editing both sides at once is caught rather than merged: a canvas save over a
file that changed on disk opens a conflict dialog that shows both versions as
FlowDocs.

## Step 5: switch to TypeScript, or back

A team that prefers typed TypeScript can switch a flow's companion:

```
npx flow-cli convert flows/appointment-line.flowdoc.json --to ts
```

```
flows/appointment-line.flow.ts
flows/appointment-line.flowdoc.json
removed flows/appointment-line.flow.tf
note: appointment-line.flow.tf's refs bindings, instance_id, tags, state and lint settings have no place in a .flow.ts and are not carried.
```

`convert` says what it drops. The flow itself is unchanged: the FlowDoc is
the same file before and after. `--to tf` goes the other way, and writes
`null` bindings for you to fill in. `--keep-old` keeps the old companion.

## What round-trips

The FlowDoc is the source of truth; both companions are views of it.
`synth(codegen(doc))` equals `doc`, and regenerating a companion from what it
just wrote reproduces it byte for byte. Both are tested on every push, over
every fixture in `conformance/`. An action type the tooling does not model is
carried as a `generic` block (HCL) or a `GenericBlock` (TypeScript) with its
parameters unchanged, and shows on the canvas as a generic node: nothing is
dropped.
