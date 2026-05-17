import { DynamicModule, Module, Type } from '@nestjs/common'

@Module({})
export class AppModule {
  static forRoot(modules: Array<DynamicModule | Type<unknown>> = []): DynamicModule {
    return {
      module: AppModule,
      imports: [...modules],
    }
  }
}
