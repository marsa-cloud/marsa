---
paths:
  - 'apps/api/.swcrc'
  - 'apps/api/tsconfig*.json'
  - 'apps/api/nest-cli.json'
  - 'apps/api/drizzle.config.ts'
---

# Build configuration

`nest build` uses the **SWC builder** (`nest-cli.json` → `compilerOptions.builder.type: "swc"`),
not tsc. That single fact causes every trap below.

## Emit options belong in `.swcrc`, not `tsconfig.json`

```jsonc
// WRONG — changing tsconfig's module/target has NO effect on the build
// tsconfig.json
{ "compilerOptions": { "module": "commonjs" } }

// RIGHT — .swcrc is what SWC reads
{ "module": { "type": "nodenext" } }
```

Why: `tsconfig.json` drives type-checking and editor IntelliSense only. If you add a compiler
option that affects emit, **mirror it in `.swcrc`** or it silently does nothing.

## `module.type` must stay `nodenext`

The package is `"type": "module"`, so CommonJS output crashes at load with
`ReferenceError: exports is not defined`.

## Nest DI needs decorator metadata

`.swcrc` must keep `jsc.transform.legacyDecorator` and `jsc.transform.decoratorMetadata`.
Without them every injected constructor parameter resolves to `undefined` at runtime, with no
build error.

## Never strip `.js` from import specifiers

SWC preserves them as written, which is what NodeNext ESM needs. See
`.claude/rules/api/imports.md`.

## `jsc.paths` mirrors the subpath imports

The `#src/*` / `#test/*` mapping is declared in `tsconfig.json`, `package.json` `imports`, and
`.swcrc` `jsc.paths`. Change one, change all three.

## drizzle-kit output

`drizzle.config.ts` writes migrations to `src/sql/drizzle`, reads the `src/sql/schema.ts`
barrel, and its `dbCredentials` are used only by studio/push — `generate` and the runtime
migrator never connect. See `.claude/rules/api/table.md`.
