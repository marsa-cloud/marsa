import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger'
import { pgEnum } from 'drizzle-orm/pg-core'

export enum DatabaseEngine {
  Postgres = 'postgres',
}

export const databaseEngineEnum = pgEnum('database_engine_enum', DatabaseEngine)

export const DatabaseEngineApiProperty = (options?: ApiPropertyOptions): PropertyDecorator =>
  ApiProperty({ ...options, enum: DatabaseEngine, enumName: 'DatabaseEngine' })
