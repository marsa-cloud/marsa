import { Module } from '@nestjs/common'
import { ManifestStateService } from '#src/app/github-app/manifest-state/manifest-state.service.js'

@Module({
  providers: [ManifestStateService],
  exports: [ManifestStateService],
})
export class ManifestStateModule {}
