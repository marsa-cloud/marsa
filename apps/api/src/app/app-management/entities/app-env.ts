import { buildMessage, registerDecorator, type ValidationOptions } from 'class-validator'

/**
 * Valid Kubernetes env-var name (`EnvVar.name`): must start with a letter or
 * one of `-._`, followed by letters, digits, or `-._`. Keys that don't match
 * fail late at cluster apply, so we reject them at the DTO boundary instead.
 */
export const ENV_KEY_PATTERN = /^[-._a-zA-Z][-._a-zA-Z0-9]*$/

/**
 * Validates that a value is a plain object whose values are ALL strings AND
 * whose keys are ALL valid Kubernetes env-var names (`ENV_KEY_PATTERN`).
 * `@IsObject()` alone accepts `{ LOG_LEVEL: 1 }` (non-string value) or
 * `{ '1BAD': 'x' }` (invalid key) — both flow into the deploy path and fail
 * late at cluster apply (Rex #103, r3493223271 + the env-key follow-up). Since
 * class-validator has no built-in record check, this decorator provides one for
 * both dimensions.
 *
 * Lives with the App aggregate, which owns the `env` column, so both the
 * deploy command and the env-update command validate it the same way.
 */
export function IsAppEnvRecord(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAppEnvRecord',
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
