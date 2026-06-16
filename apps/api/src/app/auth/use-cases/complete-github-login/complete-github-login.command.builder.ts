import { CompleteGithubLoginCommand } from '#src/app/auth/use-cases/complete-github-login/complete-github-login.command.js'

/** Test-side builder for {@link CompleteGithubLoginCommand}; on the request path Nest deserialises the DTO. */
export class CompleteGithubLoginCommandBuilder {
  private readonly command = new CompleteGithubLoginCommand()

  constructor() {
    this.command.code = 'mock-code'
    this.command.state = '00000000-0000-0000-0000-000000000000'
  }

  withCode(code: string): this {
    this.command.code = code
    return this
  }

  withState(state: string): this {
    this.command.state = state
    return this
  }

  build(): CompleteGithubLoginCommand {
    return this.command
  }
}
