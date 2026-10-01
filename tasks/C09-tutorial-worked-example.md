# C09 Tutorial: a worked example at a tag

Phase C, docs. Gated on C08 (so the page can open the flows), on
`flow-as-code/hollow-hour-example-typescript` being public, and on a tag in it whose commit is the
one `examples/vendored/hollow-hour-example/COMMIT` pins. A page that links to a private or moving target is not published.

`docs/tutorials/05-worked-example-hollow-hour-example.md`, published under a new
`PAGES` group in `scripts/build-site.mjs`, walks a reader through what the
showcase shows about the tools. It is a tutorial, not an announcement: it
explains how a set of flows is authored, checked and promoted, and says
nothing about when anything was or will be released.

The showcase has two approach-specific repositories. The page walks the
TypeScript-first one, which the snapshot comes from, and links the
Terraform-first one (`flow-as-code/hollow-hour-example-terraform`, the same
flows written directly in HCL) as the other way in, pinned to a tag the same
way.

## Acceptance criteria

- The page covers, each with the file in the satellite it comes from:
  - one FlowDoc set reaching three environments, shown as the static
    three-way diff of the emitted flowascode trees (they differ only in
    `flows.tf`'s `refs` values) rather than on the canvas;
  - the district generator: one config entry yields exactly two new
    generated flows and one more key in the generated `hh-district-menu`,
    with no other flow diff and no hand edit (the satellite's T1 criterion 5
    as amended, held by its `tests/generator.test.ts`); the page states it in
    those words, and is checked against the satellite at the pinned tag
    before it is published;
  - switching the greeting as a rebinding of one module alias in the address
    map, and rolling it back as the reverse;
  - a lint finding the draft hit and how the flow was changed to clear it
    (the recording notice before the recording block);
  - what the example does not claim: the scenarios that cannot be simulated
    and why, and that Lex is not part of the baseline.
- It opens the vendored flows in the hosted studio with a relative link
  (`../studio/#example=hollow-hour-example`, or whatever the site's layout makes
  relative), and `tests/site.test.ts`'s internal-link check resolves it.
- Every link into the satellite is absolute and names the tag, never a
  branch. A test reads the page, collects those links, and fails on any that
  names a different ref than the tag recorded next to the snapshot (C07's
  README or a `TAG` file, decided there). `resolveLink`'s rewrite of relative
  links to this repository's GitHub is not relied on for satellite links.
- The `PAGES` entry has its own `title` and `description` written for that
  page, in a group the /docs/ index lists after "Worked example";
  `tests/site.test.ts`'s check that every markdown file under `docs/` is
  published stays green.
- Transcripts are from real runs, identifiers masked as in the provider
  tutorials: no account id, ARN, instance id or phone number outside
  555-0100 to 555-0199.
- No launch date, no timing, no positioning. The page is held to the same
  rule as the rest of `docs/`: nothing under it is a marketing document.
- `llms.txt` lists the page (it is generated from `PAGES`).
