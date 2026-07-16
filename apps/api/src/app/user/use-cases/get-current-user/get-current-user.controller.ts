import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { CurrentUser } from '#src/app/user/decorators/current-user.decorator.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { GetCurrentUserResponse } from '#src/app/user/use-cases/get-current-user/get-current-user.response.js'
import { GetCurrentUserUseCase } from '#src/app/user/use-cases/get-current-user/get-current-user.use-case.js'

@ApiTags('auth')
@Controller({ path: 'auth/me', version: '1' })
export class GetCurrentUserController {
  constructor(private readonly usecase: GetCurrentUserUseCase) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ operationId: 'getCurrentUserV1' })
  @ApiOkResponse({ type: GetCurrentUserResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  async handle(@CurrentUser() userUuid: UserUuid): Promise<GetCurrentUserResponse> {
    const user = await this.usecase.execute(userUuid)
    return new GetCurrentUserResponse(user)
  }
}
