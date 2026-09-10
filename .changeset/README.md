# Changesets

A user-visible change ships with a changeset: run `npx changeset`, pick the
packages it affects and the bump, and commit the generated markdown file with
the change. The text becomes the changelog entry, so write it for someone
upgrading, not for the reviewer.

All five packages are `linked` in `config.json`, so they version together and a
bump to one bumps all of them. Do not hand-edit a version in a `package.json`.

`npx changeset version` consumes the pending files and writes the versions and
changelogs; that is a release step, not something to run in a feature branch.
