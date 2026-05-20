import { DynamicModule, Module, Type } from '@nestjs/common'

import { DatabaseModule } from '#src/modules/database/database.module.js'

@Module({})
export class AppModule {
  static forRoot(modules: Array<DynamicModule | Type<unknown>> = []): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule, ...modules],
    }
  }
}
