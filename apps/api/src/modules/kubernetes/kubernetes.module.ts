import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { DirectApplyDeployBackend } from '#src/modules/kubernetes/direct-apply-deploy-backend.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'

@Module({
  providers: [
    {
      provide: DeployBackend,
      useFactory: (config: ConfigService) =>
        config.get<string>('DEPLOY_BACKEND', 'direct') === 'mock'
          ? new MockDeployBackend()
          : new DirectApplyDeployBackend(),
      inject: [ConfigService],
    },
  ],
  exports: [DeployBackend],
})
export class KubernetesModule {}
