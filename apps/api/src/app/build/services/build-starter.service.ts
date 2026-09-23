import { Injectable } from '@nestjs/common'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import type { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarterRepository } from '#src/app/build/services/build-starter.repository.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'
import type { BuildRef } from '#src/modules/runtime/runtime.types.js'

export interface StartBuildOptions {
  trigger: BuildTrigger
  commitSha: string
}

const refOf = (app: App, build: Build): BuildRef => ({
  build: { uuid: build.uuid },
  app: { slug: app.slug },
})

@Injectable()
export class BuildStarter {
  constructor(
    private readonly repository: BuildStarterRepository,
    private readonly cipher: SecretCipherService,
    private readonly github: GithubClient,
    private readonly buildRuntime: BuildRuntime,
    private readonly imageRegistry: ImageRegistry,
  ) {}

  async mintToken(tx: Executor, source: AppSource): Promise<string> {
    const credentials = await this.repository.findCredentials(tx, source.installationUuid)
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
  async start(tx: Executor, app: App, { trigger, commitSha }: StartBuildOptions): Promise<Build> {
    const source = app.source
    if (!source) {
      throw new Error(`App '${app.slug}' has no source to build.`)
    }
    const superseded = await this.repository.cancelRunning(tx, app.uuid)
    const build = await this.repository.insert(tx, {
      appUuid: app.uuid,
      commitSha,
      branch: source.branch,
      status: BuildStatus.Running,
      trigger,
    })
    try {
      const gitToken = await this.mintToken(tx, source)
      for (const old of superseded) {
        await this.buildRuntime.cancel(refOf(app, old))
      }
      await this.buildRuntime.start(refOf(app, build), {
        repoUrl: `https://github.com/${source.repo}.git`,
        commitSha,
        rootDir: source.rootDir,
        dockerfilePath: source.dockerfilePath,
        gitToken,
        pushRef: this.imageRegistry.pushRefFor(app.slug, commitSha),
      })
      return build
    } catch (error) {
      return this.repository.fail(tx, build.uuid, (error as Error).message)
    }
  }
}
