import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { DEFAULT_SOURCE_CONTAINER_PORT } from '#src/app/app-management/entities/app-config.constants.js'
import {
  type AppSource,
  DEFAULT_DOCKERFILE_PATH,
  DEFAULT_ROOT_DIR,
} from '#src/app/app-management/entities/app-source.js'
import { CreateAppCommand } from '#src/app/app-management/use-cases/create-app/create-app.command.js'
import { CreateAppRepository } from '#src/app/app-management/use-cases/create-app/create-app.repository.js'
import { CreateAppResponse } from '#src/app/app-management/use-cases/create-app/create-app.response.js'
import type { CreateAppSourceCommand } from '#src/app/app-management/use-cases/create-app/create-app-source.command.js'
import { buildSpecOf } from '#src/app/build/entities/build-spec.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { ImagePullCredentialsCipher } from '#src/modules/crypto/image-pull-credentials.cipher.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Database, Executor } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'
import { BuildRuntime } from '#src/modules/runtime/build-runtime.js'
import { ImageRegistry } from '#src/modules/runtime/image-registry.js'

interface BranchHead {
  commitSha: string
  token: string
}

const sourceOf = (command: CreateAppSourceCommand): AppSource => ({
  type: 'github',
  installationUuid: command.installationUuid,
  repo: command.repo,
  branch: command.branch,
  rootDir: command.rootDir ?? DEFAULT_ROOT_DIR,
  dockerfilePath: command.dockerfilePath ?? DEFAULT_DOCKERFILE_PATH,
})

@Injectable()
export class CreateAppUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: CreateAppRepository,
    private readonly credentialsCipher: ImagePullCredentialsCipher,
    private readonly secretCipher: SecretCipherService,
    private readonly github: GithubClient,
    private readonly buildRuntime: BuildRuntime,
    private readonly imageRegistry: ImageRegistry,
    private readonly config: ConfigService,
  ) {}

  async execute(command: CreateAppCommand): Promise<CreateAppResponse> {
    const source = command.source ? sourceOf(command.source) : null
    // GitHub is asked before anything is written, so an unreadable repo leaves no app behind.
    const head = source ? await this.resolveHead(source) : null
    const app = this.appOf(command, source)

    await this.db.transaction(async (tx) => {
      const outcome = await this.repository.insert(tx, app)
      if (outcome === 'environment-missing') {
        throw new NotFoundException(`Environment '${command.environmentUuid}' was not found.`)
      }
      if (outcome === 'slug-taken') {
        throw new ConflictException(`An app with slug '${command.slug}' already exists.`)
      }
      if (source && head) {
        await this.startFirstBuild(tx, app, source, head)
      }
    })

    return new CreateAppResponse(app, this.config.getOrThrow<string>('MARSA_BASE_DOMAIN'))
  }

  private appOf(command: CreateAppCommand, source: AppSource | null): App {
    const minReplicas = command.minReplicas ?? 1
    const credentials = command.imagePullCredentials
    return new AppBuilder()
      .withEnvironmentUuid(command.environmentUuid)
      .withSlug(command.slug)
      .withDomain({ type: 'subdomain' })
      .withImage(command.image ?? null)
      .withSource(source)
      .withContainerPort(command.containerPort ?? DEFAULT_SOURCE_CONTAINER_PORT)
      .withMinReplicas(minReplicas)
      .withMaxReplicas(Math.max(command.maxReplicas ?? 1, minReplicas))
      .withEnv(command.env ?? {})
      .withNodePin(command.nodePin ?? null)
      .withImagePullCredentialsEnc(credentials ? this.credentialsCipher.seal(credentials) : null)
      .build()
  }

  private async resolveHead(source: AppSource): Promise<BranchHead> {
    const credentials = await this.repository.findInstallationCredentials(source.installationUuid)
    if (!credentials) {
      throw new UnprocessableEntityException(
        `GitHub installation '${source.installationUuid}' was not found.`,
      )
    }
    const token = await this.github
      .getInstallationToken({
        githubAppId: credentials.githubAppId,
        privateKeyPem: this.secretCipher.decrypt(credentials.privateKeyPemEnc),
        installationId: credentials.installationId,
      })
      .catch((error: Error) => {
        throw new BadGatewayException(error.message, { cause: error })
      })
    const commitSha = await this.github
      .getBranchHead({ token, repo: source.repo, branch: source.branch })
      .catch((error: Error) => {
        throw new UnprocessableEntityException(error.message, { cause: error })
      })
    return { commitSha, token }
  }

  // Runtime last; a refused build is recorded on the build, and the app still exists to rebuild.
  private async startFirstBuild(
    tx: Executor,
    app: App,
    source: AppSource,
    { commitSha, token }: BranchHead,
  ): Promise<void> {
    const build = await this.repository.insertBuild(tx, {
      appUuid: app.uuid,
      commitSha,
      branch: source.branch,
      status: BuildStatus.Running,
      trigger: BuildTrigger.Create,
    })
    try {
      await this.buildRuntime.start(
        { build: { uuid: build.uuid }, app: { slug: app.slug } },
        buildSpecOf(source, commitSha, token, this.imageRegistry.pushRefFor(app.slug, commitSha)),
      )
    } catch (error) {
      await this.repository.failBuild(tx, build.uuid, (error as Error).message)
    }
  }
}
