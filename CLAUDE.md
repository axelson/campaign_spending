# Hawaii Campaign Spending

A static Vite site visualizing Hawaii candidate campaign spending data (see README.md).

## Worktrees and the dev server

This repo uses fw (fast-worktree); every worktree is a self-contained dev stack
with its own port. Start the dev server with `fw start` (it runs in the
foreground, so run it in the background). `fw info` shows this worktree's URL
and port; `fw list` shows the other worktrees and which have servers running.
`fw --help` for everything else.

- There's no database; the data is static files in `src/public/data/`.
- `npm run build` writes the production site to `docs/`, which GitHub Pages
  serves; don't edit `docs/` by hand.
