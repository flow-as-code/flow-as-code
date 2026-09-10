# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub's security advisory
form on this repository, under the Security tab, rather than opening a public
issue. Include the version or commit, what you observed, and the smallest input
that reproduces it.

Private vulnerability reporting is enabled, so the form is available to any
signed-in GitHub account. If it is ever not offered to you, open an issue saying
only that you have a report and asking for a private channel, and leave the
details out of it.

Expect an acknowledgement within a few working days. This is a small project
and there is no paid bounty.

## What is in scope

These packages generate and transform configuration. The interesting attack
surface is therefore about what a malicious or careless input document can make
the tooling do:

- A FlowDoc that causes generated TypeScript, HCL, or CloudFormation to execute
  or inject something the author did not write.
- Anything that lets authored content reach a deployed flow while bypassing the
  lint rules that block a literal ARN or an unresolved token.
- Path traversal or writing outside the target directory from any emitter, from
  `flow-cli`, or from the local studio bridge.
- Escaping the sandbox `flow-cli synth` runs a builder file in.
- The local studio bridge accepting a request that did not come from the page
  `flow-cli studio` opened. Binding to loopback is not sufficient by itself:
  any site the developer visits can send a loopback server a CORS-simple POST,
  and the bridge writes files into a directory whose builder files are later
  executed. Every API request must therefore present the session token from the
  printed URL, and requests carrying a foreign Origin or Sec-Fetch-Site are
  refused. The one exception is a top-level navigation (Sec-Fetch-Mode
  `navigate`, Sec-Fetch-Dest `document`) to a non-API path, because that is
  how the printed URL gets opened from a terminal, a chat client, or a README,
  and the page that opened it can neither read nor script the result. The
  document itself still needs the token, since index.html embeds it for the
  page. This was a real vulnerability, found in review and fixed; the
  regression tests are in packages/cli/src/bridge/forgery.test.ts.

## What is not in scope

- The permissions of an AWS account you point this tooling at. Materialized
  output contains real ARNs by design; protecting the resources they name is
  your IAM policy's job.
- `flow-cli synth` executes the TypeScript file you give it. That is its
  purpose. The sandbox reduces blast radius but is not a boundary against a
  builder file you chose to run.

## Sandbox limitations, stated plainly

`flow-cli synth` runs a builder file in a child process with a stripped
environment and a pinned working directory, and applies Node's permission model
where the runtime supports it. These limits are worth knowing:

- Network restriction depends on the runtime. Node's permission model gained
  `--allow-net` in v25.0.0, so on Node 25 and later the child has no network
  because that permission is not granted. On Node 22 and 24 the permission
  model has no network dimension at all, and the child can reach the network.
  https://nodejs.org/api/permissions.html
- The permission model itself depends on the runtime. `--permission` is stable
  from Node 23.5 and was backported to 22.13, so on 22.12, which is the
  `engines.node` floor, no permission flags are passed and the sandbox is the
  stripped environment, the pinned working directory, and process isolation
  alone. Filesystem and child-process denial start at 22.13.
- If the runtime rejects the sandbox flags outright, `flow-cli synth` retries
  without them and prints a warning saying so. The retry fires only when the
  child never ran, so a denial raised by your flow code cannot silently
  disable the sandbox.
- Filesystem reads are not jailed, because scoping them breaks the TypeScript
  loader's config discovery.
- When the builder file's own directory cannot resolve
  `@flow-as-code/core`, the child resolves it from `@flow-as-code/cli`'s
  installation instead. That fallback runs only after normal resolution has
  failed, covers that one package, and reads a file the child could already
  read; it grants no capability the sandbox otherwise withholds. See
  packages/cli/src/synth-resolve-hook.ts.

Treat a builder file the way you would treat any script you are about to run.
