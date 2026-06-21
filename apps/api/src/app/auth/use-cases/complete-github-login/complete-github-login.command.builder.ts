import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'
import { CompleteGithubLoginCommand } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.js'
import { generateUuid } from '#src/utils/uuid.js'

/** Test-side builder for {@link CompleteGithubLoginCommand}; on the request path Nest deserialises the DTO. */
export class CompleteGithubLoginCommandBuilder {
  private readonly command = new CompleteGithubLoginCommand()

  constructor() {
    this.command.code = 'mock-code'
    this.command.state = generateUuid<OAuthStateUuid>()
  }

  withCode(code: string): this {
    this.command.code = code
    return this
  }

  withState(state: OAuthStateUuid): this {
    this.command.state = state
    return this
  }

  build(): CompleteGithubLoginCommand {
    return this.command
  }
}
