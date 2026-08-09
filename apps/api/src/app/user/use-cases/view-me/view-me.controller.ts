import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { AllowGuest } from '#src/app/auth/decorators/roles.decorator.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { CurrentUser } from '#src/app/user/decorators/current-user.decorator.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { ViewMeResponse } from '#src/app/user/use-cases/view-me/view-me.response.js'
import { ViewMeUseCase } from '#src/app/user/use-cases/view-me/view-me.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/me', version: '1' })
export class ViewMeController {
  constructor(private readonly usecase: ViewMeUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  // A Guest must be able to read its own role — that is how the dashboard knows
  // to render the awaiting-approval screen instead of a blank denied page.
  @AllowGuest()
  @ApiOkResponse({ type: ViewMeResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  async handle(@CurrentUser() userUuid: UserUuid): Promise<ViewMeResponse> {
    const user = await this.usecase.execute(userUuid)
    return new ViewMeResponse(user)
  }
}
