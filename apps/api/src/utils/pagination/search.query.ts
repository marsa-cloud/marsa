import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export function SortDirectionApiProperty(options?: ApiPropertyOptions): PropertyDecorator {
  return ApiProperty({
    ...options,
    enum: SortDirection,
    enumName: 'SortDirection',
  })
}

export abstract class SortQuery {
  abstract key: unknown
  abstract order: SortDirection
}

// Marker base for a use-case's filter DTO — each one defines its own fields.
// A class, not an interface, so class-transformer can nest it via @Type().
// Named BaseFilterQuery, not FilterQuery, so it never collides with MikroORM's
// own FilterQuery<T> in repositories that import both.
export abstract class BaseFilterQuery {}

export abstract class SearchQuery {
  abstract sort?: SortQuery[]
  abstract filter?: BaseFilterQuery
  abstract search?: string
}
