import { describe, expect, it } from 'vitest'

import {
  zViewAppHealthResponse,
  zViewAppLogsResponse,
  zViewReleaseIndexResponse,
} from '~/api/zod.gen'

describe('app-detail response contracts', () => {
  it('accepts a valid release-history payload', () => {
    const valid = {
      releases: [
        {
          uuid: '11111111-1111-1111-1111-111111111111',
          imageRef: 'nginx:1.27',
          triggeredBy: 'manual',
          deployStatus: 'succeeded',
          createdAt: '2026-07-10T10:00:00.000Z',
          updatedAt: '2026-07-10T10:01:00.000Z',
          failureReason: null,
          failureMessage: null,
        },
      ],
    }
    expect(zViewReleaseIndexResponse.parse(valid)).toEqual(valid)
  })

  it('rejects a release with an unknown deployStatus', () => {
    expect(() =>
      zViewReleaseIndexResponse.parse({
        releases: [{ uuid: 'x', imageRef: 'i', triggeredBy: 'manual', deployStatus: 'boom', createdAt: '2026-07-10T10:00:00.000Z', updatedAt: '2026-07-10T10:00:00.000Z' }],
      }),
    ).toThrow()
  })

  it('accepts a valid health payload', () => {
    const valid = { status: 'healthy', availableReplicas: 1, desiredReplicas: 1 }
    expect(zViewAppHealthResponse.parse(valid)).toEqual(valid)
  })

  it('rejects a health payload with an unknown status', () => {
    expect(() =>
      zViewAppHealthResponse.parse({ status: 'on-fire', availableReplicas: 0, desiredReplicas: 1 }),
    ).toThrow()
  })

  it('accepts a valid run-logs payload (incl. null podName)', () => {
    expect(zViewAppLogsResponse.parse({ podName: null, logs: '' })).toEqual({ podName: null, logs: '' })
    expect(zViewAppLogsResponse.parse({ podName: 'pod-1', logs: 'line\n' })).toEqual({
      podName: 'pod-1',
      logs: 'line\n',
    })
  })

  it('rejects a run-logs payload missing logs', () => {
    expect(() => zViewAppLogsResponse.parse({ podName: 'pod-1' })).toThrow()
  })
})
