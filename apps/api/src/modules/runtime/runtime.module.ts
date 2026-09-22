import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { KubernetesRuntimeModule } from '#src/modules/runtime/adapters/kubernetes/kubernetes-runtime.module.js'
import { MockRuntimeModule } from '#src/modules/runtime/adapters/mock/mock-runtime.module.js'
import { RuntimeErrorFilter } from '#src/modules/runtime/runtime-error.filter.js'

// Adapter modules are @Global, so whichever one loads is visible to every feature.
@Module({
  imports: [
    ConditionalModule.registerWhen(KubernetesRuntimeModule, (env) => env.MARSA_RUNTIME !== 'mock'),
    ConditionalModule.registerWhen(MockRuntimeModule, (env) => env.MARSA_RUNTIME === 'mock'),
  ],
  providers: [{ provide: APP_FILTER, useClass: RuntimeErrorFilter }],
})
export class RuntimeModule {}
