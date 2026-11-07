import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { DomainEventEmitter } from '#src/modules/domain-events/domain-event-emitter.js'

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [DomainEventEmitter],
  exports: [DomainEventEmitter],
})
export class DomainEventsModule {}
