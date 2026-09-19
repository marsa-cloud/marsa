import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { DirectApplyDeployBackend } from '#src/modules/kubernetes/direct-apply-deploy-backend.js'
import { DirectNamespaceBackend } from '#src/modules/kubernetes/direct-namespace-backend.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'
import { MockNamespaceBackend } from '#src/modules/kubernetes/mock-namespace-backend.js'
import { NamespaceBackend } from '#src/modules/kubernetes/namespace-backend.js'

const isMock = (config: ConfigService) => config.get<string>('DEPLOY_BACKEND', 'direct') === 'mock'

@Module({
  providers: [
    {
      provide: DeployBackend,
      useFactory: (config: ConfigService) =>
        isMock(config) ? new MockDeployBackend() : new DirectApplyDeployBackend(),
      inject: [ConfigService],
    },
    {
      provide: NamespaceBackend,
      useFactory: (config: ConfigService) =>
        isMock(config)
          ? new MockNamespaceBackend()
          : new DirectNamespaceBackend(config.getOrThrow<string>('MARSA_API_NAMESPACE')),
      inject: [ConfigService],
    },
  ],
  exports: [DeployBackend, NamespaceBackend],
})
export class KubernetesModule {}
