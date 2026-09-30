# Agent skills: flow-as-code for AI coding agents

An AI coding agent can write and change Amazon Connect flows with
flow-as-code as well as a person can, provided it knows the rules Connect
enforces and the shape the tools expect. This repository ships those rules as
[Agent Skills](https://github.com/agentskills/agentskills): folders with a
`SKILL.md` that an agent loads when a task needs it.

| Skill                      | Use it to                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `author-connect-flows-hcl` | write or change `flowascode_contact_flow` and `flowascode_contact_flow_module` resources, fix a lint finding or a Connect refusal |
| `promote-connect-flows`    | lay out flows and environments, bind references per environment, write the promotion pipeline, release shared modules             |
| `adopt-connect-flows`      | take existing flows over from the console or from `hashicorp/aws` without recreating them                                         |
| `flow-cli`                 | lint, generate, convert, emit, export and diff flows with `flow-cli`                                                              |

`author-connect-flows-hcl` carries `references/actions.md`: every modeled
action type with its HCL block, its attributes, the branches Connect requires
and the flow types it is legal in. It is generated from the same action
catalog lint and the provider read (`scripts/build-skill-reference.mjs`), and a
test fails when it is out of date, so an agent is told exactly what a plan
enforces.

## Claude Code

The repository is a plugin marketplace. In Claude Code:

```
/plugin marketplace add flow-as-code/flow-as-code
/plugin install flow-as-code@flow-as-code
```

or from a shell:

```
claude plugin marketplace add https://github.com/flow-as-code/flow-as-code
claude plugin install flow-as-code@flow-as-code
```

The skills load on their own when a task matches their description, and can
be run by name, for example `/flow-as-code:author-connect-flows-hcl`. The
plugin carries no version number on purpose: an install follows the
repository, so a correction to a skill reaches you when it merges rather than
at the next release.

## Other agents

The skills use only the portable Agent Skills fields (`name`, `description`,
`license`, `compatibility`), so any agent that reads `SKILL.md` folders can use
them. Copy `plugins/flow-as-code/skills/` from the repository into the
directory your agent reads skills from. Each skill is also published on this
site as plain markdown, linked from [llms.txt](https://flow-as-code.dev/llms.txt):

- https://flow-as-code.dev/skills/author-connect-flows-hcl/SKILL.md
- https://flow-as-code.dev/skills/author-connect-flows-hcl/references/actions.md
- https://flow-as-code.dev/skills/promote-connect-flows/SKILL.md
- https://flow-as-code.dev/skills/adopt-connect-flows/SKILL.md
- https://flow-as-code.dev/skills/flow-cli/SKILL.md

An agent without skill support can read
[llms.txt](https://flow-as-code.dev/llms.txt) for a linked map of the site, or
[llms-full.txt](https://flow-as-code.dev/llms-full.txt) for every document
as one file.

## What the skills hold an agent to

The same rules a reviewer would: a reference is a key bound in `refs`, never
an ARN; every action wires the branches its type requires; flows are promoted
from one module with a root module per environment, not copied; an existing
flow is adopted, not recreated. `tests/skills.test.ts` checks, on every push,
that each skill's frontmatter is valid, that every `flow-cli` command a skill
names exists, that every complete flow a skill shows reads back through the
HCL reader and lints clean, and that the action reference matches the catalog.
