import { describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { expect } from 'expect'
import { NodePin, nodePinEquals } from '#src/app/app-management/entities/node-pin.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'

const validate = (value: unknown) =>
  validateSync(plainToInstance(NodePin, value)).flatMap((error) =>
    Object.keys(error.constraints ?? {}).map((key) => `${error.property}:${key}`),
  )

describe('NodePin', () => {
  it('accepts a hostname pin', () => {
    expect(
      validate({
        key: 'kubernetes.io/hostname',
        values: ['node-a', 'node-b'],
        strategy: PinStrategy.Required,
      }),
    ).toEqual([])
  })

  it('accepts a prefixed pool label', () => {
    expect(
      validate({ key: 'marsa.cc/pool', values: ['gpu'], strategy: PinStrategy.Preferred }),
    ).toEqual([])
  })

  it('rejects a malformed key', () => {
    expect(validate({ key: 'not a key', values: ['a'], strategy: PinStrategy.Required })).toContain(
      'key:matches',
    )
  })

  it('rejects an empty values list', () => {
    expect(
      validate({ key: 'kubernetes.io/hostname', values: [], strategy: PinStrategy.Required }),
    ).toContain('values:arrayMinSize')
  })

  it('rejects duplicate values', () => {
    expect(
      validate({
        key: 'kubernetes.io/hostname',
        values: ['node-a', 'node-a'],
        strategy: PinStrategy.Required,
      }),
    ).toContain('values:arrayUnique')
  })

  it('rejects keys Kubernetes itself would reject', () => {
    const bad = [
      'a..b/pool',
      'bad-.io/pool',
      `${'x'.repeat(254)}/pool`,
      `io/${'n'.repeat(64)}`,
      'UPPER.io/pool',
    ]
    for (const key of bad) {
      expect(validate({ key, values: ['node-a'], strategy: PinStrategy.Required })).toContain(
        'key:matches',
      )
    }
  })

  it('accepts a long but legal prefix', () => {
    expect(
      validate({
        key: `${'x'.repeat(250)}/pool`,
        values: ['node-a'],
        strategy: PinStrategy.Required,
      }),
    ).toEqual([])
  })

  it('rejects an unknown strategy', () => {
    expect(
      validate({ key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'maybe' }),
    ).toContain('strategy:isEnum')
  })
})

describe('nodePinEquals', () => {
  const base = {
    key: 'kubernetes.io/hostname',
    values: ['node-a', 'node-b'],
    strategy: PinStrategy.Required,
  }

  it('treats two nulls as equal and a null against a pin as different', () => {
    expect(nodePinEquals(null, null)).toBe(true)
    expect(nodePinEquals(null, base)).toBe(false)
    expect(nodePinEquals(base, null)).toBe(false)
  })

  it('ignores value order, since In is a set', () => {
    expect(nodePinEquals(base, { ...base, values: ['node-b', 'node-a'] })).toBe(true)
  })

  it('sees a changed key, strategy or membership', () => {
    expect(nodePinEquals(base, { ...base, key: 'marsa.cc/pool' })).toBe(false)
    expect(nodePinEquals(base, { ...base, strategy: PinStrategy.Preferred })).toBe(false)
    expect(nodePinEquals(base, { ...base, values: ['node-a', 'node-c'] })).toBe(false)
    expect(nodePinEquals(base, { ...base, values: ['node-a'] })).toBe(false)
  })
})
