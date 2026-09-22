// @ts-check
import tseslint from 'typescript-eslint'
import globals from 'globals'
import baseConfig from '../../eslint.config.mjs'

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**'],
  },
  ...baseConfig,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use absolute path imports (#src/* or #test/*) instead of relative paths.',
            },
          ],
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          // Single group: keep the deterministic order
          // (side-effects → node: → packages → #src → #test → other) but emit NO
          // blank lines between sub-groups. GH-69: the enforced group-separator
          // blank line (notably before the #src/ group) read as jarring.
          groups: [['^\\u0000', '^node:', '^@?\\w', '^#src/', '^#test/', '^']],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    // MikroORM migrations are CLI-generated and override `up()` / `down()` whose
    // base signature is `Promise<void>` — they're async by contract even when the
    // body only calls the synchronous `this.addSql`. Lint them like any other
    // source (imports, unused vars, etc.); just exempt the one rule the framework's
    // required signature conflicts with.
    files: ['src/sql/migrations/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
)
