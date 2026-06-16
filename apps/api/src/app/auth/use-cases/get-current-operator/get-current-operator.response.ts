import { ApiProperty } from '@nestjs/swagger'

import { Operator } from '#src/app/auth/entities/operator.entity.js'

export class GetCurrentOperatorResponse {
  @ApiProperty({ type: String, example: '1' })
  readonly id: string

  @ApiProperty({ type: String, example: 'octocat' })
  readonly login: string

  constructor(operator: Operator) {
    this.id = operator.githubUserId
    this.login = operator.githubLogin
  }
}
