import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator'
import { INSTALL_SETUP_ACTION } from '#src/app/github-app/use-cases/capture-installation/capture-installation.constant.js'

export class CaptureInstallationCommand {
  @ApiProperty({
    type: String,
    description: "GitHub's numeric installation id from the post-install redirect.",
    pattern: '^\\d+$',
    example: '88776655',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'installationId must be a numeric string.' })
  installationId!: string

  @ApiProperty({
    type: String,
    description: "GitHub's `setup_action` query param (expected: `install`).",
    enum: [INSTALL_SETUP_ACTION],
    example: INSTALL_SETUP_ACTION,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([INSTALL_SETUP_ACTION], {
    message: `Unsupported setup_action (expected "${INSTALL_SETUP_ACTION}").`,
  })
  setupAction!: string
}
