import { describe, it } from 'node:test'
import { validateSync } from 'class-validator'
import { expect } from 'expect'
import { IsGteField } from '#src/app/release/use-cases/deploy-app/is-gte-field.validator.js'

class Range {
  min?: number

  max?: number
}

// Applied programmatically rather than as `@IsGteField('min')`: test files run
// through Node's type stripping, which cannot parse decorator syntax.
IsGteField('min')(Range.prototype, 'max')

function validate(min: number | undefined, max: number | undefined) {
  const range = new Range()
  range.min = min
  range.max = max
  return validateSync(range)
}

describe('IsGteField', () => {
  it('accepts a value greater than the referenced field', () => {
    expect(validate(1, 3)).toHaveLength(0)
  })

  it('accepts a value equal to the referenced field', () => {
    expect(validate(2, 2)).toHaveLength(0)
  })

  it('rejects a value below the referenced field', () => {
    const errors = validate(3, 1)

    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe('max')
  })

  it('accepts any value when the referenced field is absent', () => {
    expect(validate(undefined, 3)).toHaveLength(0)
  })

  it('rejects a non-numeric value', () => {
    const errors = validate(1, 'nope' as unknown as number)

    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe('max')
  })
})
