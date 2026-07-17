import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export const SortDirectionApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: SortDirection, enumName: 'SortDirection' })
