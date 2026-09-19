import { describe, expect, it } from 'vitest'

import { buildEnvRecord, extractApiError } from '../apiHelpers'

const FALLBACK = 'Something went wrong. Please try again.'

describe('extractApiError', () => {
  it('returns a single string message from the error body', () => {
    const err = { data: { statusCode: 400, message: 'slug must be a valid DNS-1123 label', error: 'Bad Request' } }
    expect(extractApiError(err)).toBe('slug must be a valid DNS-1123 label')
  })

  it('joins an array of validation messages (NestJS ValidationPipe shape)', () => {
    const err = {
      data: {
        statusCode: 400,
        message: ['slug must be a valid DNS-1123 label', 'containerPort must not be greater than 65535'],
        error: 'Bad Request',
      },
    }
    expect(extractApiError(err)).toBe(
      'slug must be a valid DNS-1123 label; containerPort must not be greater than 65535',
    )
  })

  it('falls back to the generic message when the body has no usable message', () => {
    expect(extractApiError({ data: { statusCode: 500 } })).toBe(FALLBACK)
    expect(extractApiError(new Error('network'))).toBe(FALLBACK)
    expect(extractApiError(undefined)).toBe(FALLBACK)
  })

  it('honours a custom fallback', () => {
    expect(extractApiError(null, 'nope')).toBe('nope')
  })
})

describe('buildEnvRecord', () => {
  it('collapses rows into a record, trimming keys', () => {
    expect(buildEnvRecord([{ key: ' LOG_LEVEL ', value: 'info' }, { key: 'PORT', value: '80' }])).toEqual({
      LOG_LEVEL: 'info',
      PORT: '80',
    })
  })

  it('drops blank-key rows and keeps empty-string values', () => {
    expect(buildEnvRecord([{ key: '', value: 'orphan' }, { key: 'FLAG', value: '' }])).toEqual({ FLAG: '' })
  })

  it('lets a later duplicate key win', () => {
    expect(buildEnvRecord([{ key: 'A', value: '1' }, { key: 'A', value: '2' }])).toEqual({ A: '2' })
  })

  it('returns an empty record for no usable rows', () => {
    expect(buildEnvRecord([{ key: '', value: '' }])).toEqual({})
  })
})
