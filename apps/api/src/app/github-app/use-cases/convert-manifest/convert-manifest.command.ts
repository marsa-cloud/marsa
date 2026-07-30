import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID } from 'class-validator'
import type { ManifestStateUuid } from '#src/app/github-app/entities/manifest-state.uuid.js'

export class ConvertManifestCommand {
  @ApiProperty({ type: String, description: 'Temporary code from the GitHub redirect.' })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiProperty({ type: String, description: 'Signed CSRF state echoed back by GitHub.' })
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  state!: ManifestStateUuid
}
