import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum PinStrategy {
  Required = 'required',
  Preferred = 'preferred',
}

export const PinStrategyApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: PinStrategy, enumName: 'PinStrategy' })
