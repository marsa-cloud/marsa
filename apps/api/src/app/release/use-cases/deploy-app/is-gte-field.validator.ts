import {
  buildMessage,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

/**
 * Validates that this numeric field is >= a sibling field. class-validator has
 * no built-in cross-field comparison, and the codebase had no precedent.
 *
 * An absent reference field passes: both ends of a range are optional on the
 * deploy command, so `{ maxReplicas: 3 }` alone is legitimate — the floor
 * defaults later in the use-case. Comparing against `undefined` there would
 * reject a valid request with a message about a field the caller never sent.
 */
export function IsGteField(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isGteField',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints as [string]
          const other = (args.object as Record<string, unknown>)[related]
          if (other === undefined || other === null) {
            return true
          }
          return typeof value === 'number' && typeof other === 'number' && value >= other
        },
        defaultMessage: buildMessage(
          (prefix) => `${prefix}$property must be greater than or equal to $constraint1`,
          validationOptions,
        ),
      },
    })
  }
}
