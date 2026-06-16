import { Operator } from '#src/app/auth/entities/operator.entity.js'

export class OperatorBuilder {
  private readonly operator: Operator

  constructor() {
    this.operator = new Operator()
    this.operator.githubUserId = '1'
    this.operator.githubLogin = 'marsa-operator'
  }

  withGithubUserId(githubUserId: string): this {
    this.operator.githubUserId = githubUserId
    return this
  }

  withGithubLogin(githubLogin: string): this {
    this.operator.githubLogin = githubLogin
    return this
  }

  build(): Operator {
    return this.operator
  }
}
