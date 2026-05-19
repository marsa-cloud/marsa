import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Global, Module } from '@nestjs/common'

import config from '#src/sql/mikro-orm.config.js'

@Global()
@Module({
  imports: [MikroOrmModule.forRoot(config)],
  exports: [MikroOrmModule],
})
export class DatabaseModule {}
