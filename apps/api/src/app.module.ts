import { DynamicModule, Module, Type } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { envValidationSchema } from '#src/config/env.config.js'
import { CryptoModule } from '#src/modules/crypto/crypto.module.js'
import { DatabaseModule } from '#src/modules/database/database.module.js'

@Module({})
export class AppModule {
  static forRoot(modules: Array<DynamicModule | Type<unknown>> = []): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validationSchema: envValidationSchema,
        }),
        DatabaseModule,
        CryptoModule,
        ...modules,
      ],
    }
  }
}
