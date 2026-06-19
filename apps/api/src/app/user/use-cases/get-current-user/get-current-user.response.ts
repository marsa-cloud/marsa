import { ApiProperty } from '@nestjs/swagger'

import { User } from '#src/app/user/entities/user.entity.js'

export class GetCurrentUserResponse {
  @ApiProperty({ type: String, example: '1' })
  readonly id: string

  @ApiProperty({ type: String, example: 'octocat' })
  readonly login: string

  constructor(user: User) {
    this.id = user.githubUserId
    this.login = user.githubLogin
  }
}
