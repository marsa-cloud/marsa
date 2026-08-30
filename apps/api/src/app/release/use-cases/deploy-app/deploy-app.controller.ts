import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { DeployAppCommand } from '#src/app/release/use-cases/deploy-app/deploy-app.command.js'
import { DeployAppResponse } from '#src/app/release/use-cases/deploy-app/deploy-app.response.js'
import { DeployAppUseCase } from '#src/app/release/use-cases/deploy-app/deploy-app.use-case.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

@ApiTags('releases')
@Controller({ path: 'deploy', version: '1' })
export class DeployAppController {
  constructor(private readonly usecase: DeployAppUseCase) {}

  @Post()
  @Roles(UserRole.Operator, UserRole.Member)
  @HttpCode(200)
  @ApiOkResponse({ type: DeployAppResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiBadRequestResponse({ description: 'Malformed body, or an invalid slug / image / port.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  handle(@Body() body: DeployAppCommand): Promise<DeployAppResponse> {
    return this.usecase.execute(body)
  }
}
