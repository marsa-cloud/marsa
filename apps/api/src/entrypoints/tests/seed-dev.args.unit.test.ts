import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseSeedDevArgs } from '#src/entrypoints/seed-dev.args.js'

describe('parseSeedDevArgs', () => {
  it('defaults userOnly to false', () => {
    deepStrictEqual(parseSeedDevArgs([]), { userOnly: false })
  })
  it('sets userOnly when --user-only present', () => {
    deepStrictEqual(parseSeedDevArgs(['--user-only']), { userOnly: true })
  })
})
