import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeployBackend } from '#src/modules/kubernetes/deploy-backend.js'
import { selectDeployBackend } from '#src/modules/kubernetes/deploy-backend.selector.js'
import { DirectApplyDeployBackend } from '#src/modules/kubernetes/direct-apply-deploy-backend.js'
import { MockDeployBackend } from '#src/modules/kubernetes/mock-deploy-backend.js'

@Module({
  providers: [
    {
      provide: DeployBackend,
      useFactory: (config: ConfigService) =>
        selectDeployBackend(config.get<string>('DEPLOY_BACKEND'), config.getOrThrow('NODE_ENV')) ===
        'mock'
          ? new MockDeployBackend()
          : new DirectApplyDeployBackend(),
      inject: [ConfigService],
    },
  ],
  exports: [DeployBackend],
})
export class KubernetesModule {}
