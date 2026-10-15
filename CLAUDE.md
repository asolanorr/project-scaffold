@AGENTS.md

# Claude Code notes

- Run `pnpm check` before saying a task is done, and report its result as it
  is. If a step failed or was skipped, say so.
- Never edit the rules in AGENTS.md to make a change pass. If a rule is wrong,
  say so and ask; do not rewrite it.
- Nested `AGENTS.md` files take precedence in their folder, and each has a
  `CLAUDE.md` next to it that imports it.
- Custom commands live in `.claude/commands/`, shared hooks in
  `.claude/settings.json`.
