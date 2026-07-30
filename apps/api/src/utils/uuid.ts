import { v7 as uuidv7 } from 'uuid'

export type Uuid<Brand extends string> = string & { readonly __brand: 'uuid' } & {
  readonly __uuid: Brand
}

export function generateUuid<Brand extends Uuid<string> | null>(): Exclude<Brand, null> {
  return uuidv7() as Exclude<Brand, null>
}
