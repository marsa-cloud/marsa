import { describe, it } from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { expect } from 'expect'
import { NodePin } from '#src/app/app-management/entities/node-pin.js'
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

  it('rejects an unknown strategy', () => {
    expect(
      validate({ key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'maybe' }),
    ).toContain('strategy:isEnum')
  })
})
