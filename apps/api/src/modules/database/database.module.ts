import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Pool } from 'pg'
import { DATABASE, DATABASE_POOL } from '#src/modules/database/database.tokens.js'
import { databaseUrl } from '#src/modules/database/database-url.js'
import {
  createDatabase,
  type Database,
  MIGRATIONS_FOLDER,
} from '#src/modules/database/drizzle.factory.js'
import { migrate } from '#src/modules/database/migrate.js'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        return new Pool({ connectionString: databaseUrl(configService) })
      },
    },
    {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool): Database => createDatabase(pool),
    },
  ],
  exports: [DATABASE, DATABASE_POOL],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      await migrate(this.db, MIGRATIONS_FOLDER)
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}
