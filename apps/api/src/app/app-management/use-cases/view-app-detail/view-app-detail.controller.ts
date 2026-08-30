import { Controller, Get, Param } from '@nestjs/common'
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ViewAppDetailResponse } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.response.js'
import { ViewAppDetailUseCase } from '#src/app/app-management/use-cases/view-app-detail/view-app-detail.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug', version: '1' })
export class ViewAppDetailController {
  constructor(private readonly usecase: ViewAppDetailUseCase) {}

  @Get()
  @Roles(UserRole.Operator, UserRole.Member)
  @ApiOkResponse({ type: ViewAppDetailResponse })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  handle(@Param('slug') slug: string): Promise<ViewAppDetailResponse> {
    return this.usecase.execute(slug)
  }
}
