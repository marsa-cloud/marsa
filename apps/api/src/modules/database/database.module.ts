import { MikroORM } from '@mikro-orm/core'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Global, Module, type OnModuleInit } from '@nestjs/common'

import config from '#src/sql/mikro-orm.config.js'

@Global()
@Module({
  imports: [MikroOrmModule.forRoot(config)],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private readonly orm: MikroORM) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      await this.orm.migrator.up()
    }
  }
}
