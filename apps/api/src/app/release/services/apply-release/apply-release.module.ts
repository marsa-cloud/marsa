import { Module } from '@nestjs/common'
import { ApplyReleaseService } from '#src/app/release/services/apply-release/apply-release.service.js'
import { KubernetesModule } from '#src/modules/kubernetes/kubernetes.module.js'

@Module({
  imports: [KubernetesModule],
  providers: [ApplyReleaseService],
  exports: [ApplyReleaseService],
})
export class ApplyReleaseModule {}
