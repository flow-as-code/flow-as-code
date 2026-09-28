[![flow-as-code](https://flow-as-code.dev/logo.png)](https://flow-as-code.dev/)

# @flow-as-code/hcl

```
npm i @flow-as-code/hcl
```

Apache-2.0, Node 22.12 or newer. Browser-safe: no Node built-ins anywhere in
its module graph, so the studio bundles it.

Site and docs: <https://flow-as-code.dev/>. This package on npm:
<https://www.npmjs.com/package/@flow-as-code/hcl>.

HCL as a third view over FlowDoc (ADR-0007): a document can have a
`<name>.flow.tf` companion, a `flowascode_contact_flow` resource the
`flow-as-code/flowascode` Terraform provider applies, instead of a
`<name>.flow.ts`. The mapping is the contract in `conformance/hcl/README.md`,
which the provider implements too. This package is its TypeScript side.

Two layers ship. The syntax layer is a lossless lexer and parser for the HCL
native syntax, a formatter that writes exactly what `terraform fmt` and
`tofu fmt` write, literal evaluation, and HCL string quoting. The document
layer on top of it writes a FlowDoc as its companion (`fromFlowDoc`), reads a
companion back (`toFlowDoc`), and regenerates a companion without losing what
the user wrote beside the document.

## Documents

```ts
import { fromFlowDoc, toFlowDoc } from "@flow-as-code/hcl";

const tf = fromFlowDoc(doc, {
  bindings: { "queue:appointments": "aws_connect_queue.appointments.arn" },
  fileName: "appointment-line.flowdoc.json",
});
const { doc: back, sidecar, warnings } = toFlowDoc(tf, { fileName: "appointment-line.flow.tf" });
```

`fromFlowDoc` writes the resource by the contract's rules 1 to 17: one
`action` block per action, a typed sub-block wherever the catalog's shape
accepts the action's `Parameters` and `generic` otherwise, reference fields as
keys (`"queue:appointments"`) bound once in `refs`, an unbound key as `null`
under a `# TODO` comment, and `position` only where the canvas moved an action
off the auto-layout. The output is a `terraform fmt` fixed point. Given
`previous`, the companion on disk, it carries what rule 24 names from it
rather than from the document: `refs` values by key, `instance_id`, `tags`,
`state`, `external_invocation_enabled`, `lint`, `provider`, `lifecycle`,
`depends_on`, and comment lines marked `@keep` directly above the resource or
an action.

`toFlowDoc` reads a companion to its document in synth normal form and a
sidecar of what the file holds beside it (`refs` bindings, `lint`, `tags`, the
`instance_id` expression, kept comments, and every value it normalized). A
reference field may hold a key, a JSONPath, the full token
(`"$${cdref:queue:appointments}"`), or a resource address the contract's sugar
table lists (`aws_connect_queue.appointments.arn`), which reads as the key
plus a binding, so the next regeneration writes the key. Anything else is an
`HclError` whose `code` is the contract's and whose `path` names the
attribute (`action[set-queue].update_contact_target_queue.queue_id`); the
message says which `refs` entry to write instead. A `refs` key no action uses
is a warning, dropped on the next regeneration.

The view holds what a canvas or a `.flow.ts` holds and no more:
`content.Metadata`, which an exported flow may carry, is not written, and a
fractional console position is written rounded.

## Parse, print, format

```ts
import { format, parse, print } from "@flow-as-code/hcl";

const file = parse(text, "appointment-line.flow.tf");
print(file) === text; // every character is kept: whitespace, comments, escapes
format(text); // the canonical layout, as terraform fmt writes it
```

`parse` returns a syntax tree over the file's full token array: every node
records its first and last token, so it can be printed as written
(`sourceOf`), located in an error, or have the comments around it found. A
syntax error is an `HclError` whose message starts with `file:line:column`.

`format` is a port of hclwrite's formatter, pass for pass: it indents each
line by its bracket depth, sets the space between each pair of tokens by
hclwrite's rules, and aligns the `=` of consecutive single-line attributes and
their trailing comments. A line that opens a multi-line value is left out of
the alignment run, as hclwrite leaves it. The package's conformance test holds
`format` to the text of every Terraform file committed to this repository, and
to `tofu fmt` itself when `RUN_TOFU_VALIDATE=1`. Terraform's fmt command also
rewrites some legacy syntax (an interpolation-only `"${var.x}"` becomes
`var.x`); `format` does not.

## Literals and strings

```ts
import { evaluateLiteral, quote, unquoteLiteral } from "@flow-as-code/hcl";

evaluateLiteral(expr, file); // strings, numbers, booleans, null, tuples, objects
quote("Balance: ${amount}"); // "Balance: $${amount}"
```

`evaluateLiteral` refuses anything that needs an evaluation context (a
variable, a call, an interpolation) with the contract's `NON_LITERAL_VALUE`
code. `quote` writes a string by the contract's rule 16: `\\`, `\"`, `\n`,
`\r` and `\t` escaped, any other control character as `\uXXXX`, `${` and `%{`
doubled so they stay literal, everything else raw. A lone surrogate has no
UTF-8 spelling and is refused either way with `LONE_SURROGATE`.
