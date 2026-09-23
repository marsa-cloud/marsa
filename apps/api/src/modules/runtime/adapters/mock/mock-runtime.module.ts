import { Global, Module } from '@nestjs/common'
import { MockAppRuntime } from '#src/modules/runtime/adapters/mock/mock-app-runtime.js'
import { MockEnvironmentRuntime } from '#src/modules/runtime/adapters/mock/mock-environment-runtime.js'
import { MockImageRegistry } from '#src/modules/runtime/adapters/mock/mock-image-registry.js'
import { MockNodeRuntime } from '#src/modules/runtime/adapters/mock/mock-node-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'

@Global()
@Module({
  providers: [
    { provide: AppRuntime, useClass: MockAppRuntime },
    { provide: EnvironmentRuntime, useClass: MockEnvironmentRuntime },
    { provide: NodeRuntime, useClass: MockNodeRuntime },
    { provide: ImageRegistry, useClass: MockImageRegistry },
  ],
  exports: [AppRuntime, EnvironmentRuntime, NodeRuntime, ImageRegistry],
})
export class MockRuntimeModule {}
