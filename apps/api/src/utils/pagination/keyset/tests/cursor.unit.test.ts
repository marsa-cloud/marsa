import { before, describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { decodeCursor, encodeCursor } from '#src/utils/pagination/keyset/cursor.js'

describe('keyset cursor codec', () => {
  before(() => TestBench.setupUnitTest())

  it('round-trips a string sortValue', () => {
    const token = encodeCursor({ sortValue: '2026-07-16T00:00:00.000Z', id: 'abc' })
    expect(decodeCursor(token)).toEqual({ sortValue: '2026-07-16T00:00:00.000Z', id: 'abc' })
  })

  it('round-trips a numeric sortValue', () => {
    const token = encodeCursor({ sortValue: 42, id: 'xyz' })
    expect(decodeCursor(token)).toEqual({ sortValue: 42, id: 'xyz' })
  })

  it('rejects a non-decodable token', () => {
    expect(() => decodeCursor('!!!not valid!!!')).toThrow(BadRequestException)
  })

  it('rejects well-formed JSON of the wrong shape', () => {
    const token = Buffer.from(JSON.stringify({ nope: 1 }), 'utf8').toString('base64url')
    expect(() => decodeCursor(token)).toThrow(BadRequestException)
  })
})
