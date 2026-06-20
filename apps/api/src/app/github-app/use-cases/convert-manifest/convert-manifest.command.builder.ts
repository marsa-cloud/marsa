import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'
import { ConvertManifestCommand } from '#src/app/github-app/use-cases/convert-manifest/convert-manifest.command.js'

/** Test-side builder for {@link ConvertManifestCommand}; on the request path Nest deserialises the DTO. */
export class ConvertManifestCommandBuilder {
  private readonly command = new ConvertManifestCommand()

  withCode(code: string): this {
    this.command.code = code
    return this
  }

  withState(state: ManifestStateUuid): this {
    this.command.state = state
    return this
  }

  build(): ConvertManifestCommand {
    return this.command
  }
}
