import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common'
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { DeleteAppUseCase } from '#src/app/app-management/use-cases/delete-app/delete-app.use-case.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'

@ApiTags('apps')
@Controller({ path: 'apps/:slug', version: '1' })
export class DeleteAppController {
  constructor(private readonly usecase: DeleteAppUseCase) {}

  @Delete()
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiNoContentResponse({ description: 'The app and its Kubernetes resources were removed.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiNotFoundResponse({ description: 'No app with that slug.' })
  @ApiResponse({ status: 502, description: 'Kubernetes teardown failed; the app was kept.' })
  handle(@Param('slug') slug: string): Promise<void> {
    return this.usecase.execute(slug)
  }
}
