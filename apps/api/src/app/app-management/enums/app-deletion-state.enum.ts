import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum AppDeletionState {
  Active = 'active',
  Deleting = 'deleting',
  DeletionFailed = 'deletion_failed',
}

export const AppDeletionStateApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: AppDeletionState, enumName: 'AppDeletionState' })
