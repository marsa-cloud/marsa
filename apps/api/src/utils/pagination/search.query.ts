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

// Members are deliberately NOT abstract. An abstract member forces every
// subclass to redeclare it, and an undecorated redeclaration is rejected by the
// global pipe's forbidNonWhitelisted — a 400 on every request, with a green
// build. Leaving them concrete means a use-case redeclares only what it uses,
// with the validators that make it whitelisted.
export abstract class SearchQuery {
  sort?: SortQuery[]
  filter?: BaseFilterQuery
  search?: string
}
