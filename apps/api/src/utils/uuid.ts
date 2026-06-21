import { randomUUID } from 'crypto'

export type Uuid<Brand extends string> = string & { readonly __brand: 'uuid' } & {
  readonly __uuid: Brand
}

export function generateUuid<Brand extends Uuid<string> | null>(): Exclude<Brand, null> {
  return randomUUID() as Exclude<Brand, null>
}
