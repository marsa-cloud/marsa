import { v7 as uuidv7 } from 'uuid'

export type Uuid<Brand extends string> = string & { readonly __brand: 'uuid' } & {
  readonly __uuid: Brand
}

export function generateUuid<Brand extends Uuid<string> | null>(): Exclude<Brand, null> {
  return uuidv7() as Exclude<Brand, null>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cluster annotations are free-form text; Postgres raises 22P02 on a non-uuid uuid-column compare.
export function isUuid<Brand extends Uuid<string>>(value: string | null): value is Brand {
  return value !== null && UUID_PATTERN.test(value)
}
