import { buildMessage, registerDecorator, type ValidationOptions } from 'class-validator'

/**
 * Validates that a value is a plain object whose values are ALL strings
 * (`Record<string, string>`). `@IsObject()` alone accepts `{ LOG_LEVEL: 1 }`,
 * which would flow non-string env values into the deploy path (Rex #103,
 * r3493223271). class-validator has no built-in record-value check, so this
 * co-located decorator provides one.
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
          return Object.values(value).every((v) => typeof v === 'string')
        },
        defaultMessage: buildMessage(
          (prefix) => `${prefix}$property must be an object with string values`,
          validationOptions,
        ),
      },
    })
  }
}
