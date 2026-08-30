import { Controller, Delete, HttpCode, Param } from '@nestjs/common'
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug', version: '1' })
export class DeleteAppController {
  constructor(private readonly usecase: DeleteAppUseCase) {}

  @Delete()
  @Roles(UserRole.Operator, UserRole.Member)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The app and its Kubernetes resources were removed.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiResponse({ status: 502, description: 'Kubernetes teardown failed; the app was kept.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
