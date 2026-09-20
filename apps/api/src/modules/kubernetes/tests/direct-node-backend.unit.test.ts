import { describe, it } from 'node:test'
import { expect } from 'expect'
import { toClusterNodes } from '#src/modules/kubernetes/direct-node-backend.js'

describe('toClusterNodes', () => {
  it('maps name, labels and readiness', () => {
    expect(
      toClusterNodes([
        {
          metadata: { name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' } },
          status: { conditions: [{ type: 'Ready', status: 'True' }] },
        },
      ]),
    ).toEqual([{ name: 'node-a', labels: { 'kubernetes.io/hostname': 'node-a' }, ready: true }])
  })

  it('reports a node whose Ready condition is False as not ready', () => {
    expect(
      toClusterNodes([
        {
          metadata: { name: 'node-b' },
          status: { conditions: [{ type: 'Ready', status: 'False' }] },
        },
      ]),
    ).toEqual([{ name: 'node-b', labels: {}, ready: false }])
  })

  it('treats a node with no conditions as not ready', () => {
    expect(toClusterNodes([{ metadata: { name: 'node-c' }, status: {} }])).toEqual([
      { name: 'node-c', labels: {}, ready: false },
    ])
  })

  it('drops a node with no name', () => {
    expect(toClusterNodes([{ metadata: {}, status: {} }])).toEqual([])
  })
})
