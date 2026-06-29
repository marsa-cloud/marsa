import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { DeployAppCommand } from '#src/app/deployments/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppResponse } from '#src/app/deployments/use-cases/deploy-app/deploy-app.response.js'
import { DeployAppUseCase } from '#src/app/deployments/use-cases/deploy-app/deploy-app.use-case.js'

@ApiTags('deployments')
@Controller({ path: 'deployments/deploy', version: '1' })
export class DeployAppController {
  constructor(private readonly usecase: DeployAppUseCase) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: 'deployAppV1' })
  @ApiOkResponse({ type: DeployAppResponse })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid slug / image / port.' })
  handle(@Body() body: DeployAppCommand): Promise<DeployAppResponse> {
    return this.usecase.execute(body)
  }
}
