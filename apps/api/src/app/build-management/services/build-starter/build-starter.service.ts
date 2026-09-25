import { Injectable } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { Build } from '#src/app/build-management/entities/build.table.js'
import { buildRefOf } from '#src/app/build-management/entities/build-ref.js'
import { BuildStatus } from '#src/app/build-management/enums/build-status.enum.js'
import type { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildStarterRepository } from '#src/app/build-management/services/build-starter/build-starter.repository.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'

export interface StartBuildOptions {
  trigger: BuildTrigger
  commitSha: string
  gitToken: string
}

@Injectable()
export class BuildStarter {
  constructor(
    private readonly repository: BuildStarterRepository,
    private readonly cipher: SecretCipherService,
    private readonly github: GithubClient,
    private readonly buildRuntime: BuildRuntime,
    private readonly imageRegistry: ImageRegistry,
  ) {}

  async mintToken(source: AppSource): Promise<string> {
    const credentials = await this.repository.findCredentials(source.installationUuid)
    if (!credentials) {
      throw new Error(`The GitHub App installation for ${source.repo} no longer exists.`)
    }
    return this.github.getInstallationToken({
      githubAppId: credentials.githubAppId,
      privateKeyPem: this.cipher.decrypt(credentials.privateKeyPemEnc),
      installationId: credentials.installationId,
    })
  }

  // Never throws once the build row exists: a failure is recorded on the build instead.
  async start(tx: Executor, app: App, options: StartBuildOptions): Promise<Build> {
    const source = app.source
    if (!source) {
      throw new Error(`App '${app.slug}' has no source to build.`)
    }
    const superseded = await this.repository.cancelRunning(tx, app.uuid)
    const build = await this.repository.insert(tx, {
      appUuid: app.uuid,
      commitSha: options.commitSha,
      branch: source.branch,
      status: BuildStatus.Running,
      trigger: options.trigger,
    })
    try {
      for (const old of superseded) {
        await this.buildRuntime.cancel(buildRefOf(app.slug, old.uuid))
      }
      await this.buildRuntime.start(buildRefOf(app.slug, build.uuid), {
        repoUrl: `https://github.com/${source.repo}.git`,
        commitSha: options.commitSha,
        rootDir: source.rootDir,
        dockerfilePath: source.dockerfilePath,
        gitToken: options.gitToken,
        pushRef: this.imageRegistry.pushRefFor(app.slug, options.commitSha),
      })
      return build
    } catch (error) {
      return this.repository.fail(tx, build.uuid, (error as Error).message)
    }
  }
}
