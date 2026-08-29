import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '#src/app/auth/decorators/roles.decorator.js'
import { GetManifestResponse } from '#src/app/github-app/use-cases/get-manifest/get-manifest.response.js'
import { GetManifestUseCase } from '#src/app/github-app/use-cases/get-manifest/get-manifest.use-case.js'

@ApiTags('github-app')
@Controller({ path: 'github-app/manifest', version: '1' })
export class GetManifestController {
  constructor(private readonly usecase: GetManifestUseCase) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: GetManifestResponse })
  handle(): Promise<GetManifestResponse> {
    return this.usecase.execute()
  }
}
