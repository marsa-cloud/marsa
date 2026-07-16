import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID } from 'class-validator'
import type { OAuthStateUuid } from '#src/app/auth/entities/oauth-state.uuid.js'

export class CompleteGithubLoginCommand {
  @ApiProperty({
    type: String,
    description: "GitHub's user-OAuth authorization code from the consent redirect.",
  })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiProperty({
    type: String,
    description: 'The CSRF state issued by `GET /auth/github`, echoed back by GitHub.',
  })
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  state!: OAuthStateUuid
}
