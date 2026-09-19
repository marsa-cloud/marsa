import { describe, it } from 'node:test'
import { validateSync } from 'class-validator'
import { expect } from 'expect'
import { CreateAppCommandBuilder } from '#src/app/app-management/use-cases/create-app/create-app.command.builder.js'

// Routed through CreateAppCommand: type-stripped test files cannot declare a decorated class.
function validateRange(minReplicas: number | undefined, maxReplicas: number | undefined) {
  const builder = new CreateAppCommandBuilder()
  if (minReplicas !== undefined) {
    builder.withMinReplicas(minReplicas)
  }
  if (maxReplicas !== undefined) {
    builder.withMaxReplicas(maxReplicas)
  }
  return validateSync(builder.build())
}

describe('IsGteField', () => {
  it('accepts a ceiling above the floor', () => {
    expect(validateRange(1, 3)).toHaveLength(0)
  })

  it('accepts a ceiling equal to the floor', () => {
    expect(validateRange(2, 2)).toHaveLength(0)
  })

  it('rejects a ceiling below the floor', () => {
    const errors = validateRange(3, 1)

    expect(errors).toHaveLength(1)
    expect(errors[0]?.property).toBe('maxReplicas')
    expect(Object.keys(errors[0]?.constraints ?? {})).toContain('isGteField')
  })

  it('accepts any ceiling when the floor is absent', () => {
    expect(validateRange(undefined, 3)).toHaveLength(0)
  })

  it('rejects a non-numeric ceiling', () => {
    const errors = validateRange(1, 'nope' as unknown as number)

    expect(errors).toHaveLength(1)
    expect(Object.keys(errors[0]?.constraints ?? {})).toContain('isGteField')
  })
})
