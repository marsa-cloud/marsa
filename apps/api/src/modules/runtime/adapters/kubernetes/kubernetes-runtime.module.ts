import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { KubernetesAppRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-app-runtime.js'
import { KubernetesBuildRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-build-runtime.js'
import { KubernetesEnvironmentRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-environment-runtime.js'
import { KubernetesNodeRuntime } from '#src/modules/runtime/adapters/kubernetes/kubernetes-node-runtime.js'
import { ZotImageRegistry } from '#src/modules/runtime/adapters/zot/zot-image-registry.js'
import { AppRuntime } from '#src/modules/runtime/app-runtime.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { EnvironmentRuntime } from '#src/modules/runtime/environment-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
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
    { provide: BuildRuntime, useClass: KubernetesBuildRuntime },
    {
      // Zot runs in the same cluster as the apps, so this adapter ships with the Kubernetes one.
      provide: ImageRegistry,
      useFactory: (config: ConfigService) =>
        new ZotImageRegistry({
          host: config.getOrThrow<string>('MARSA_REGISTRY_HOST'),
          url: config.getOrThrow<string>('MARSA_REGISTRY_URL'),
          pushPassword: config.getOrThrow<string>('MARSA_REGISTRY_PUSH_PASSWORD'),
          pullPassword: config.getOrThrow<string>('MARSA_REGISTRY_PULL_PASSWORD'),
        }),
      inject: [ConfigService],
    },
  ],
  exports: [AppRuntime, EnvironmentRuntime, NodeRuntime, ImageRegistry, BuildRuntime],
})
export class KubernetesRuntimeModule {}
