import { Controller, Get } from '@nestjs/common'
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { CurrentUser } from '#src/app/user/decorators/current-user.decorator.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { ViewMeResponse } from '#src/app/user/use-cases/view-me/view-me.response.js'
import { ViewMeUseCase } from '#src/app/user/use-cases/view-me/view-me.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/me', version: '1' })
export class ViewMeController {
  constructor(private readonly usecase: ViewMeUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member, UserRole.Guest)
  @ApiOkResponse({ type: ViewMeResponse })
  @ApiForbiddenResponse({ description: 'Your account is not approved for this action.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  async handle(@CurrentUser() userUuid: UserUuid): Promise<ViewMeResponse> {
    const user = await this.usecase.execute(userUuid)
    return new ViewMeResponse(user)
  }
}
