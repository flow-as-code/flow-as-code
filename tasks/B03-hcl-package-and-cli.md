# B03 `@flow-as-code/hcl` and the CLI companions

Deliverables: `packages/hcl`, a browser-safe package that reads and writes HCL as a third view over FlowDoc, implementing `conformance/hcl/README.md`; the CLI commands that create, convert, emit and watch `.flow.tf` companions; bridge protocol 2 for the studio.
Acceptance: `print(parse(text))` is byte-exact and `format(parse(text))` equals `tofu fmt`'s output for every committed Terraform file; `toFlowDoc(fromFlowDoc(doc))` reproduces every `conformance/hcl/roundtrip` document and `fromFlowDoc` reproduces its golden; the parse, refuse and regenerate cases pass; `flow-cli init --author tf`, `codegen --to tf`, `synth` of a `.flow.tf`, `convert`, `export --author tf` and `emit --target flowascode` work; the watcher pairs `.flow.tf` companions and re-syncs within a second.

## Sub-tasks

| #    | Scope                                                                                    |
| ---- | ---------------------------------------------------------------------------------------- |
| B03a | The package: lexer, parser, printer, fmt-exact formatter, literals, quoting; repo wiring |
| B03b | Document layer: `fromFlowDoc`, `toFlowDoc`, regeneration, `emitFlowascode`               |
| B03c | CLI commands, the watcher and pairing, bridge protocol 2                                 |
| B03e | Validation against the real provider (after B04k)                                        |

## Operator step (before the next release that includes the package)

`@flow-as-code/hcl` is a new package, and npm's trusted publishing cannot create a package that does not exist yet. After B03a merges and before the next `changeset version`, publish it once by hand at the fixed group's current version (`npm publish --workspace @flow-as-code/hcl --access public` from a clean build) and add its Trusted Publisher on npmjs.com naming this repository and `release.yml`, as the other five have. Until that is done, `release.yml`'s `changeset publish` would fail on this package. Record the date here when it is done.

## Notes (2026-09-28, B03a)

- The lexer keeps every character: horizontal whitespace rides on the next token, comments are tokens (a line comment's carries its newline, as hclsyntax's does), and quoted strings and heredocs are split into literal runs and `${ }` / `%{ }` sequences with escapes kept verbatim. The parser covers the native syntax: bodies, labelled and single-line blocks, and every expression form (templates, tuples, objects with newline or comma separators, traversals with attribute, index and splat steps, namespaced calls, unary, binary and conditional operators, parentheses, and `for` expressions). Every node records its first and last token.
- `format` ports hclwrite's formatter pass for pass (line splitting, indent by bracket depth, `spaceAfterToken`, and the `=` and trailing-comment alignment cells, including hclwrite's rule that a line opening a multi-line value is left out of the alignment run). Probed first against `tofu fmt` for the rules the committed files do not exercise (`!`, `{ }`, blank lines, comment alignment). Across all 89 committed Terraform files it agrees with `tofu fmt` byte for byte, which found one committed file that was not formatted: `conformance/emit-tf/hostile-text/validate/stubs.tf`, now formatted (its contents are unchanged).
- The gated comparison excludes `refuse/lone-surrogate`, which HCL's own parser refuses ("Cannot encode character U+d800 in UTF-8"); the contract README now says the provider passes that case on Terraform's parse error while this package raises `LONE_SURROGATE`.
- Wiring: the workspace and root `tsconfig.json`, `sync:license`, `PACKAGE_NAMES.hcl` in core and the studio's demo copy, the packaging test's tables, the site's package page and llms.txt roles, CI's gated lane and publish dry-run loop, and every sentence that counted five packages (the README, CONTRIBUTING, the changeset README, the landing page, core's README, and the release workflow's comments, which now say the new package's Trusted Publisher follows its first hand publish).
- Neutered and watched go red: the multi-line alignment exclusion (65 files), the no-space-around-dot rule (74 files), and `//` comments in the lexer.

## Notes (2026-09-28, B03b, reader and writer)

- `fromFlowDoc` lays the resource out line by line with its indentation and hands the text to `format`, so `=` alignment is hclwrite's, not a second implementation of it. It reproduces all twelve `hcl/roundtrip` goldens and all seven `hcl/regenerate` goldens byte for byte, and writing its own output as `previous` reproduces it (rule 25).
- `toFlowDoc` reads every `hcl/roundtrip` golden to its document and bindings, every `hcl/parse` input to its document and sidecar, and refuses every `hcl/refuse` input with its code and path. A sweep holds the round trip over every FlowDoc 0.2 committed under `conformance/` and `examples/` (80 documents), each written, read back and compared with its view.
- The sweep found what the contract had not said, now rules 15, 18 and 26: an exported flow's console positions are fractional, and the writer rounds them; `content.Metadata`, which export keeps, is not part of any view (codegen drops it too); and nothing wired reads as `{}` only on a type the catalog marks terminal or does not model, since the builder writes empty `Errors` and `Conditions` on any other (a waiting `MessageParticipantIteratively` in the participant case).
- Contract fix: `refuse/refuse-module-sugar` refused `flowascode_contact_flow_module.question.arn`, an address the sugar table lists, so the case contradicted rule 21. It is now `refuse/refuse-alias-sugar`, refusing the alias resource's address (`flowascode_contact_flow_module_alias.question_prod.arn`) and naming the `refs` key that binds it. Rule 21 and `address-sugar.json` now say which shape `REF_SUGAR_UNSUPPORTED_TYPE` covers (`<type>.<label>.arn` and `data.<type>.<label>.arn` of an unlisted type); every other expression is `REF_EXPRESSION_REFUSED`.
- Neutered and watched red, then restored: the `@keep` filter, the terminal normal-form rule, the stale-key drop, the sugar binding, position rounding, the literal-ARN check on `refs` values, and carrying `instance_id`.
