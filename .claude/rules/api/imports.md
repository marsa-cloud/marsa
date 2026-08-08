---
paths:
  - 'apps/api/src/**/*.ts'
---

# Imports (api)

## Use subpath imports, never relative paths

```ts
// WRONG — an ESLint error
import { AppBuilder } from '../../entities/app.builder.js'

// RIGHT
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
```

`#src/*` → `./src/*` and `#test/*` → `./src/test/*`, mapped in three places that must agree:
`tsconfig.json` `paths`, `package.json` `imports` (which points at `dist/` for runtime
resolution), and `.swcrc` `jsc.paths`.

## Always write the `.js` extension

```ts
// WRONG — resolves in the editor, throws at runtime
import { appTable } from '#src/app/app-management/entities/app.table'

// RIGHT
import { appTable } from '#src/app/app-management/entities/app.table.js'
```

Why: NodeNext ESM resolution requires the extension, and it stays `.js` even when the file
on disk is `.ts` — that is what the compiled output will be.

## Keep the import block one visually-unbroken group

Order is enforced by `simple-import-sort`: side-effects → `node:` → packages → `#src/*` →
`#test/*` → other. The sub-groups are sorted but **not** separated by blank lines (GH-69).
One blank line is required after the block, before the first statement.

## Unused imports and vars are errors

Prefix an intentionally-unused argument with `_`.
