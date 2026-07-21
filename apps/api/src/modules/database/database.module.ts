import { MikroORM } from '@mikro-orm/core'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Global, Inject, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Pool } from 'pg'
import { DATABASE, DATABASE_POOL } from '#src/modules/database/database.tokens.js'
import { createDatabase, type Database } from '#src/modules/database/drizzle.factory.js'
import config from '#src/sql/mikro-orm.config.js'

@Global()
@Module({
  imports: [MikroOrmModule.forRoot(config), ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool =>
        new Pool({
          connectionString: configService.getOrThrow('DATABASE_URL'),
          database: configService.getOrThrow('DB_NAME'),
        }),
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
    private readonly orm: MikroORM,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      await this.orm.migrator.up()
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }
}
