import { Module } from '@nestjs/common'
import { BuildStarterModule } from '#src/app/build/services/build-starter.module.js'
import { ReceivePushController } from '#src/app/build/use-cases/receive-push/receive-push.controller.js'
import { ReceivePushRepository } from '#src/app/build/use-cases/receive-push/receive-push.repository.js'
import { ReceivePushUseCase } from '#src/app/build/use-cases/receive-push/receive-push.use-case.js'

@Module({
  imports: [BuildStarterModule],
  controllers: [ReceivePushController],
  providers: [ReceivePushUseCase, ReceivePushRepository],
})
export class ReceivePushModule {}
