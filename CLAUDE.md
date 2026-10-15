@AGENTS.md

# Claude Code notes

- Run `pnpm check` before saying a task is done, and report its result as it
  is. If a step failed or was skipped, say so.
- Never edit the rules in AGENTS.md to make a change pass. If a rule is wrong,
  say so and ask; do not rewrite it.
- Nested `AGENTS.md` files take precedence in their folder, and each has a
  `CLAUDE.md` next to it that imports it.
- `/new-feature <description>` (`.claude/commands/new-feature.md`) is the required
  workflow for a new feature, including its cross-user scoping test.
- A hook runs `biome check` on every file you edit (`.claude/settings.json`); fix
  what it reports rather than working around it. It only sees Edit/Write; a file
  created through the shell is checked first by `pnpm check`, so run it.
