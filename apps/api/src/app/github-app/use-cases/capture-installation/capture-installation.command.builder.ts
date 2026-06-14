import { CaptureInstallationCommand } from '#src/app/github-app/use-cases/capture-installation/capture-installation.command.js'

/** Test-side builder for {@link CaptureInstallationCommand}; on the request path Nest deserialises the DTO. */
export class CaptureInstallationCommandBuilder {
  private readonly command = new CaptureInstallationCommand()

  withInstallationId(installationId: string): this {
    this.command.installationId = installationId
    return this
  }

  withSetupAction(setupAction: string): this {
    this.command.setupAction = setupAction
    return this
  }

  build(): CaptureInstallationCommand {
    return this.command
  }
}
