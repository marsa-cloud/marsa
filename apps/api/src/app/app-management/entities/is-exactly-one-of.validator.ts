import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

// class-validator has no class-level rules, so the check lives on one of the two fields.
export function IsExactlyOneOf(other: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isExactlyOneOf',
      target: object.constructor,
      propertyName,
      constraints: [other],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [related] = args.constraints as [string]
          const otherValue = (args.object as Record<string, unknown>)[related]
          return (value !== undefined) !== (otherValue !== undefined)
        },
        defaultMessage(args: ValidationArguments) {
          return `Send exactly one of ${args.property} or ${args.constraints[0] as string}.`
        },
      },
    })
  }
}
