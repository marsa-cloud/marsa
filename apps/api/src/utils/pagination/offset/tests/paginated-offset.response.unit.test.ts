import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import {
  PaginatedOffsetResponse,
  PaginatedOffsetResponseMeta,
} from '#src/utils/pagination/offset/paginated-offset.response.js'

describe('offset pagination response DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('meta captures total/offset/limit', () => {
    const meta = new PaginatedOffsetResponseMeta(42, 20, 10)

    expect(meta.total).toBe(42)
    expect(meta.offset).toBe(20)
    expect(meta.limit).toBe(10)
  })

  it('constructs from an existing meta instance', () => {
    const meta = new PaginatedOffsetResponseMeta(1, 0, 10)
    const res = new PaginatedOffsetResponse<string>(['a'], meta)

    expect(res.items).toEqual(['a'])
    expect(res.meta).toBe(meta)
  })

  // The (total, limit, offset) overload takes limit BEFORE offset, while the
  // meta constructor takes offset before limit — this pins that mapping.
  it('constructs from loose total/limit/offset arguments', () => {
    const res = new PaginatedOffsetResponse<string>(['a'], 42, 10, 20)

    expect(res.meta).toBeInstanceOf(PaginatedOffsetResponseMeta)
    expect(res.meta.total).toBe(42)
    expect(res.meta.limit).toBe(10)
    expect(res.meta.offset).toBe(20)
  })
})
