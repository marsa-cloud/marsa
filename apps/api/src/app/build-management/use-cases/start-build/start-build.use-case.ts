import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { AppSource } from '#src/app/app-management/entities/app-source.js'
import { BuildTrigger } from '#src/app/build-management/enums/build-trigger.enum.js'
import { BuildSummary } from '#src/app/build-management/responses/build-summary.response.js'
import { BuildStarter } from '#src/app/build-management/services/build-starter/build-starter.service.js'
import { StartBuildRepository } from '#src/app/build-management/use-cases/start-build/start-build.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { BranchNotFoundError } from '#src/modules/github-client/github-client.errors.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class StartBuildUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: StartBuildRepository,
    private readonly starter: BuildStarter,
    private readonly github: GithubClient,
  ) {}

  // The GitHub calls run before the app row is locked, so a slow GitHub never holds the lock.
  async execute(slug: string): Promise<BuildSummary> {
    const app = await this.repository.findAppBySlug(slug)
    if (!app) {
      throw new NotFoundException(`App '${slug}' was not found.`)
    }
    const source = app.source
    if (!source) {
      throw new ConflictException(
        `App '${slug}' deploys a prebuilt image; there is nothing to build.`,
      )
    }
    const gitToken = await this.mintToken(source)
    const commitSha = await this.readBranchHead(gitToken, source)
    const build = await this.db.transaction(async (tx) => {
      const locked = await this.repository.lockApp(tx, app.uuid)
      if (!locked) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }
      if (!isSameBranch(locked.source, source)) {
        throw new ConflictException(
          `App '${slug}' changed its source while the build was starting. Please try again.`,
        )
      }
      return this.starter.start(tx, locked, {
        trigger: BuildTrigger.Manual,
        commitSha,
        gitToken,
      })
    })
    return new BuildSummary(build)
  }

  private async mintToken(source: AppSource): Promise<string> {
    try {
      return await this.starter.mintToken(source)
    } catch (error) {
      throw new BadGatewayException((error as Error).message, { cause: error })
    }
  }

  private async readBranchHead(token: string, source: AppSource): Promise<string> {
    try {
      return await this.github.getBranchHead({ token, repo: source.repo, branch: source.branch })
    } catch (error) {
      if (error instanceof BranchNotFoundError) {
        throw new UnprocessableEntityException(error.message, { cause: error })
      }
      throw new BadGatewayException((error as Error).message, { cause: error })
    }
  }
}

function isSameBranch(current: AppSource | null, resolved: AppSource): boolean {
  return current?.repo === resolved.repo && current.branch === resolved.branch
}
