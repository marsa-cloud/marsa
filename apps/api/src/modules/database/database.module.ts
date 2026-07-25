import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Global, Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { DATABASE, DATABASE_POOL } from '#src/modules/database/database.tokens.js'
import {
  createDatabase,
  type Database,
  MIGRATIONS_FOLDER,
} from '#src/modules/database/drizzle.factory.js'
import config from '#src/sql/mikro-orm.config.js'

@Global()
@Module({
  imports: [MikroOrmModule.forRoot(config), ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        // DATABASE_URL carries no db path (mirrors MikroORM's clientUrl + dbName
        // split); set the db on the URL path, not Pool's `database` field, which
        // pg silently overwrites when parsing connectionString.
        const url = new URL(configService.getOrThrow('DATABASE_URL'))
        url.pathname = `/${configService.getOrThrow('DB_NAME')}`
        return new Pool({ connectionString: url.toString() })
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
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      await migrate(this.db, { migrationsFolder: MIGRATIONS_FOLDER })
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}
