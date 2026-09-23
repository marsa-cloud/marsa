import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { BuildTrigger } from '#src/app/build/enums/build-trigger.enum.js'
import { BuildSummary } from '#src/app/build/responses/build-summary.response.js'
import { BuildStarter } from '#src/app/build/services/build-starter.service.js'
import { StartBuildRepository } from '#src/app/build/use-cases/start-build/start-build.repository.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'
import { GithubClient } from '#src/modules/github-client/github-client.js'

@Injectable()
export class StartBuildUseCase {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly repository: StartBuildRepository,
    private readonly starter: BuildStarter,
    private readonly github: GithubClient,
  ) {}

  async execute(slug: string): Promise<BuildSummary> {
    return this.db.transaction(async (tx) => {
      const app = await this.repository.findAppBySlug(tx, slug)
      if (!app) {
        throw new NotFoundException(`App '${slug}' was not found.`)
      }
      const source = app.source
      if (!source) {
        throw new ConflictException(
          `App '${slug}' deploys a prebuilt image; there is nothing to build.`,
        )
      }
      const token = await this.starter.mintToken(tx, source).catch((error: Error) => {
        throw new BadGatewayException(error.message, { cause: error })
      })
      const commitSha = await this.github
        .getBranchHead({ token, repo: source.repo, branch: source.branch })
        .catch((error: Error) => {
          throw new UnprocessableEntityException(error.message, { cause: error })
        })
      const build = await this.starter.start(tx, app, { trigger: BuildTrigger.Manual, commitSha })
      return new BuildSummary(build)
    })
  }
}
