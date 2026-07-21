import { buildMessage, registerDecorator, type ValidationOptions } from 'class-validator'
import { ENV_KEY_PATTERN } from '#src/app/release/use-cases/deploy-app/deploy-app.constants.js'

/**
 * Validates that a value is a plain object whose values are ALL strings AND
 * whose keys are ALL valid Kubernetes env-var names (`ENV_KEY_PATTERN`).
 * `@IsObject()` alone accepts `{ LOG_LEVEL: 1 }` (non-string value) or
 * `{ '1BAD': 'x' }` (invalid key) — both flow into the deploy path and fail
 * late at cluster apply (Rex #103, r3493223271 + the env-key follow-up). Since
 * class-validator has no built-in record check, this co-located decorator
 * provides one for both dimensions.
 */
export function IsStringRecord(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStringRecord',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false
          }
          return Object.entries(value).every(
            ([key, v]) => typeof v === 'string' && ENV_KEY_PATTERN.test(key),
          )
        },
        defaultMessage: buildMessage(
          (prefix) =>
            `${prefix}$property must be an object with string values and valid env-var-name keys`,
          validationOptions,
        ),
      },
    })
  }
}
