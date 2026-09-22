import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { KubernetesAppRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-app-runtime.js'
import { KubernetesEnvironmentRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-environment-runtime.js'
import { KubernetesNodeRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-node-runtime.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { NodeRuntime } from '#src/modules/runtime/node-runtime.js'

@Global()
@Module({
  providers: [
    {
      provide: EnvironmentRuntime,
      useFactory: (config: ConfigService) =>
        new KubernetesEnvironmentRuntime(config.getOrThrow<string>('MARSA_API_NAMESPACE')),
      inject: [ConfigService],
    },
    {
      provide: AppRuntime,
      useFactory: (environments: EnvironmentRuntime) => new KubernetesAppRuntime(environments),
      inject: [EnvironmentRuntime],
    },
    { provide: NodeRuntime, useClass: KubernetesNodeRuntime },
  ],
  exports: [AppRuntime, EnvironmentRuntime, NodeRuntime],
})
export class KubernetesRuntimeModule {}
