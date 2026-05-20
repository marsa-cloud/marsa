import { DynamicModule, MiddlewareConsumer, Module, Type } from '@nestjs/common'

import { DatabaseModule } from '#src/modules/database/database.module.js'

@Module({})
export class TestModule {
  static forRoot(
    modules: Array<DynamicModule | Type<unknown>> = [],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _migrationsRun = false,
  ): DynamicModule {
    return {
      module: TestModule,
      imports: [DatabaseModule, ...modules],
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_consumer: MiddlewareConsumer) {
    // TODO: add auth middleware
  }
}
