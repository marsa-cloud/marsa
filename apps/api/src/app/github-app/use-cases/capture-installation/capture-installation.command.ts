import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class CaptureInstallationCommand {
  @ApiProperty({
    type: String,
    description: "GitHub's numeric installation id from the post-install redirect.",
  })
  @IsString()
  @IsNotEmpty()
  installationId!: string

  @ApiProperty({
    type: String,
    description: "GitHub's `setup_action` query param (expected: `install`).",
  })
  @IsString()
  @IsNotEmpty()
  setupAction!: string
}
