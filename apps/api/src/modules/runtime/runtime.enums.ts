import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'

export enum NodePinStrategy {
  Required = 'required',
  Preferred = 'preferred',
}

// NotFound is absence of observation, not a state — never persist a terminal outcome from it.
export enum RolloutStatus {
  Complete = 'complete',
  Failed = 'failed',
  Progressing = 'progressing',
  NotFound = 'not_found',
}

export enum BuildState {
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  NotFound = 'not_found',
}

export enum DatabaseStatus {
  Provisioning = 'provisioning',
  Ready = 'ready',
  Failed = 'failed',
  NotFound = 'not_found',
}

export const DatabaseStatusApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: DatabaseStatus, enumName: 'DatabaseStatus' })
