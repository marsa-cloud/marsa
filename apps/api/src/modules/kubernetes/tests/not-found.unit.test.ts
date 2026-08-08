import { describe, it } from 'node:test'
import { ApiException } from '@kubernetes/client-node'
import { expect } from 'expect'
import { ignoreNotFound, isNotFound } from '#src/modules/kubernetes/not-found.js'

describe('isNotFound', () => {
  it('is true for a 404 ApiException', () => {
    expect(isNotFound(new ApiException(404, 'Not Found', {}, {}))).toBe(true)
  })

  it('is false for any other status', () => {
    expect(isNotFound(new ApiException(403, 'Forbidden', {}, {}))).toBe(false)
  })

  it('is false for a plain error', () => {
    expect(isNotFound(new Error('socket hang up'))).toBe(false)
  })
})

describe('ignoreNotFound', () => {
  it('resolves when the delete succeeds', async () => {
    let called = false
    await ignoreNotFound(() => {
      called = true
      return Promise.resolve()
    })
    expect(called).toBe(true)
  })

  it('swallows a 404 so a retried teardown still completes', async () => {
    await ignoreNotFound(() => Promise.reject(new ApiException(404, 'Not Found', {}, {})))
  })

  it('rethrows anything that is not a 404', async () => {
    await expect(
      ignoreNotFound(() => Promise.reject(new ApiException(500, 'Server Error', {}, {}))),
    ).rejects.toThrow('Server Error')
  })
})
