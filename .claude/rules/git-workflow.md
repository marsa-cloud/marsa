# Git Workflow Rules

## Format before committing

Always run `pnpm format` before staging and committing, and stage the formatted
result. Prettier is the source of truth for formatting and is **not** wired into
ESLint, so `lint` won't catch formatting drift — CI runs `format:check` as a
separate step and fails on any unformatted file. Formatting first keeps commits
clean and avoids a red `format:check`.

This is advisory (there is no pre-commit hook enforcing it); apply it on every
commit.
