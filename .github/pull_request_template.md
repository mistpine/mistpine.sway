<!--
Title: a Conventional Commit header, e.g. `feat: color the focused bar`.
PRs are squash-merged and the title becomes the commit on main: lowercase,
imperative, 72 characters at most (aim for 50).

Keep every heading. Tick a box only for a command you ran on this branch;
otherwise leave it unticked and say why below it.
-->

## What and why

<!-- What changes and the problem it solves. Link the issue: `Closes #123`. -->

## Checks

- [ ] `pnpm lint && pnpm typecheck`
- [ ] `pnpm check` (`themes/` and `examples/` match the generator and the spec)
- [ ] `pnpm verify` (sway 1.9 and 1.11, i3 4.23 and 4.25; CI runs it too)

## Theme

- [ ] `themes/` and `examples/` come from `pnpm generate`, not edits by hand
- [ ] New settings exist in sway 1.9 and i3 4.23, or the README says which version needs them

## Screenshots

<!-- Before and after for any visible change. `pnpm render` regenerates the
README screenshots. Delete if nothing visible changed. -->
