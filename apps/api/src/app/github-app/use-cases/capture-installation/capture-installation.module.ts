import { Module } from '@nestjs/common'

import { CaptureInstallationController } from '#src/app/github-app/use-cases/capture-installation/capture-installation.controller.js'
import { CaptureInstallationRepository } from '#src/app/github-app/use-cases/capture-installation/capture-installation.repository.js'
import { CaptureInstallationUseCase } from '#src/app/github-app/use-cases/capture-installation/capture-installation.use-case.js'
import { GitHubClientModule } from '#src/modules/github-client/github-client.module.js'

@Module({
  imports: [GitHubClientModule],
  controllers: [CaptureInstallationController],
  providers: [CaptureInstallationUseCase, CaptureInstallationRepository],
})
export class CaptureInstallationModule {}
