import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

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
  @IsNotEmpty()
  state!: string
}
