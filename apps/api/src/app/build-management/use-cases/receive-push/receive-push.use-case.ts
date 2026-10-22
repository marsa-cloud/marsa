import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { verify } from '@octokit/webhooks-methods'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Build } from '#src/app/build-management/entities/build.table.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import {
  type BranchHead,
  BuildStarter,
} from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { INVALID_SIGNATURE } from '#src/app/build-management/use-cases/receive-push/receive-push.constants.js'
import { ReceivePushRepository } from '#src/app/build-management/use-cases/receive-push/receive-push.repository.js'
import {
  ReceivePushResponse,
  type StartedBuild,
} from '#src/app/build-management/use-cases/receive-push/receive-push.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import {
  type GitHubPush,
  installationIdOf,
  PUSH_EVENT,
  readBranchPush,
} from '#src/modules/github-client/github-push.js'

export interface WebhookDelivery {
  event?: string
  signature?: string
  rawBody?: Buffer
}

@Injectable()
export class ReceivePushUseCase {
  private readonly logger = new Logger(ReceivePushUseCase.name)

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: ReceivePushRepository,
    private readonly starter: BuildStarter,
    private readonly cipher: SecretCipherService,
  ) {}

  async execute(delivery: WebhookDelivery): Promise<ReceivePushResponse> {
    const payload = await this.verifiedPayload(delivery)
    const push = delivery.event === PUSH_EVENT ? readBranchPush(payload) : null
    if (!push) {
      return new ReceivePushResponse([])
    }

    const apps = await this.repository.findAppsToBuild(push)
    const head = await this.headIfCurrent(apps, push)
    if (!head) {
      return new ReceivePushResponse([])
    }
    const started: StartedBuild[] = []
    for (const app of apps) {
      try {
        const build = await this.startBuild(app, head)
        if (build) {
          started.push({ appSlug: app.slug, build })
        }
      } catch (error) {
        this.logger.error(
          `starting a push build of ${app.slug} failed: ${(error as Error).message}`,
        )
      }
    }
    return new ReceivePushResponse(started)
  }

  private async verifiedPayload({ signature, rawBody }: WebhookDelivery): Promise<unknown> {
    if (!signature || !rawBody) {
      throw new UnauthorizedException(INVALID_SIGNATURE)
    }
    const body = rawBody.toString('utf8')
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      throw new BadRequestException('The webhook body is not JSON.')
    }

    const installationId = installationIdOf(payload)
    const secretEnc = installationId
      ? await this.repository.findSecretByInstallation(installationId)
      : await this.repository.findNewestSecret()
    if (!secretEnc) {
      throw new UnauthorizedException(INVALID_SIGNATURE)
    }
    const valid = await verify(this.cipher.decrypt(secretEnc), body, signature).catch(() => false)
    if (!valid) {
      throw new UnauthorizedException(INVALID_SIGNATURE)
    }
    return payload
  }

  // Matched apps share one repo and branch; a push the branch has since moved past is skipped.
  private async headIfCurrent(apps: App[], push: GitHubPush): Promise<BranchHead | null> {
    const source = apps[0]?.source
    if (!source) {
      return null
    }
    const head = await this.starter.resolveHead(source)
    if (head.commitSha !== push.commitSha) {
      this.logger.log(`skipping push of ${push.commitSha}: ${push.branch} is now ${head.commitSha}`)
      return null
    }
    return head
  }

  // The head is resolved before the app row is locked, so a slow GitHub never holds the lock.
  private async startBuild(matched: App, head: BranchHead): Promise<Build | null> {
    const source = matched.source
    if (!source) {
      return null
    }
    return this.db.transaction(async (tx) => {
      const app = await this.repository.lockApp(tx, matched.uuid)
      if (app?.source?.repo !== source.repo || app.source.branch !== source.branch) {
        return null
      }
      if (await this.repository.isNewestBuildLive(tx, app.uuid, head.commitSha)) {
        return null
      }
      return this.starter.start(tx, app, { trigger: BuildTrigger.Push, ...head })
    })
  }
}
