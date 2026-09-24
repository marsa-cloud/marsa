import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { verify } from '@octokit/webhooks-methods'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Build } from '#src/app/build/entities/build.table.js'
import { BuildStatus } from '#src/app/build/enums/build-status.enum.js'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import {
  installationIdOf,
  PUSH_EVENT,
  readBranchPush,
} from '#src/app/build/use-cases/receive-push/github-push.js'
import { ReceivePushRepository } from '#src/app/build/use-cases/receive-push/receive-push.repository.js'
import {
  ReceivePushResponse,
  type StartedBuild,
} from '#src/app/build/use-cases/receive-push/receive-push.response.js'
import { SecretCipherService } from '#src/modules/crypto/secret-cipher.service.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

export interface WebhookDelivery {
  event?: string
  signature?: string
  rawBody?: Buffer
}

const INVALID_SIGNATURE = 'The webhook signature is missing or invalid.'

// A redelivery of the commit already building or built must not build it twice.
const isRedelivery = (newest: Build | undefined, commitSha: string): boolean =>
  newest?.commitSha === commitSha &&
  (newest.status === BuildStatus.Running || newest.status === BuildStatus.Succeeded)

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
    const started: StartedBuild[] = []
    for (const app of apps) {
      try {
        const build = await this.startBuild(app, push.commitSha)
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

  private async startBuild(matched: App, commitSha: string): Promise<Build | null> {
    return this.db.transaction(async (tx) => {
      const app = await this.repository.lockApp(tx, matched.uuid)
      if (!app?.source) {
        return null
      }
      const newest = await this.repository.findNewestBuild(tx, app.uuid)
      if (isRedelivery(newest, commitSha)) {
        return null
      }
      return this.starter.start(tx, app, { trigger: BuildTrigger.Push, commitSha })
    })
  }
}
