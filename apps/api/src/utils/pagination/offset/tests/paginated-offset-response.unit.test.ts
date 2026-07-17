import { before, describe, it } from 'node:test'
import { expect } from 'expect'
import { TestBench } from '#src/test/setup/test-bench.js'
import { PaginatedOffsetResponse } from '#src/utils/pagination/offset/paginated-offset.response.js'
import { PaginatedOffsetResponseMeta } from '#src/utils/pagination/offset/paginated-offset-response-meta.js'

describe('offset pagination response DTOs', () => {
  before(() => TestBench.setupUnitTest())

  it('meta captures total/offset/limit', () => {
    const meta = new PaginatedOffsetResponseMeta(42, 20, 10)
    expect(meta.total).toBe(42)
    expect(meta.offset).toBe(20)
    expect(meta.limit).toBe(10)
  })

  it('response wraps items + meta', () => {
    const meta = new PaginatedOffsetResponseMeta(1, 0, 10)
    const res = new PaginatedOffsetResponse<string>(['a'], meta)
    expect(res.items).toEqual(['a'])
    expect(res.meta).toBe(meta)
  })
})
