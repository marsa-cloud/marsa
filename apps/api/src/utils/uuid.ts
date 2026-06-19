import { isUUID } from 'class-validator'

/** A string known to be uuid-shaped, distinct from a plain `string` at the type level (AgDR-0018). */
export type Uuid = string & { readonly __uuidBrand: unique symbol }

/** Validates `value` is uuid-shaped and brands it as `Uuid`; throws otherwise. */
export function asUuid(value: string): Uuid {
  if (!isUUID(value)) {
    throw new Error(`Expected a UUID, got: ${value}`)
  }
  return value as Uuid
}
