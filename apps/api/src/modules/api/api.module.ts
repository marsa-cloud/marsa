import { MiddlewareConsumer, Module } from '@nestjs/common'

import { AppModule } from '#src/app.module.js'
import { StatusModule } from '#src/modules/status/status.module.js'

@Module({
  imports: [AppModule.forRoot([StatusModule])],
})
export class ApiModule {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configure(_consumer: MiddlewareConsumer): void {
    //ODO: Apply auth middleware
  }
}
