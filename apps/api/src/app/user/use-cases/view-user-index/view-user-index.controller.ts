import { Controller, Get, UseGuards } from '@nestjs/common'
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { ViewUserIndexResponse } from '#src/app/user/use-cases/view-user-index/view-user-index.response.js'
import { ViewUserIndexUseCase } from '#src/app/user/use-cases/view-user-index/view-user-index.use-case.js'

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class ViewUserIndexController {
  constructor(private readonly usecase: ViewUserIndexUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @Roles(UserRole.Operator)
  @ApiOkResponse({ type: ViewUserIndexResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiForbiddenResponse({ description: 'Operators only.' })
  handle(): Promise<ViewUserIndexResponse> {
    return this.usecase.execute()
  }
}
