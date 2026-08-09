import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { SessionAuthGuard } from '#src/app/auth/guards/session-auth.guard.js'
import { CurrentUser } from '#src/app/user/decorators/current-user.decorator.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { UpdateUserRoleCommand } from '#src/app/user/use-cases/update-user-role/update-user-role.command.js'
import { UpdateUserRoleResponse } from '#src/app/user/use-cases/update-user-role/update-user-role.response.js'
import { UpdateUserRoleUseCase } from '#src/app/user/use-cases/update-user-role/update-user-role.use-case.js'

@ApiTags('users')
@Controller({ path: 'users/:uuid/role', version: '1' })
export class UpdateUserRoleController {
  constructor(private readonly usecase: UpdateUserRoleUseCase) {}

  @Patch()
  @UseGuards(SessionAuthGuard)
  @Roles(UserRole.Operator)
  @ApiOkResponse({ type: UpdateUserRoleResponse })
  @ApiBadRequestResponse({ description: 'Unknown role, or an attempt to change your own.' })
  @ApiUnauthorizedResponse({ description: 'No active session.' })
  @ApiForbiddenResponse({ description: 'Operators only.' })
  @ApiNotFoundResponse({ description: 'No user with that uuid.' })
  handle(
    @CurrentUser() actingUserUuid: UserUuid,
    @Param('uuid', ParseUUIDPipe) targetUuid: UserUuid,
    @Body() command: UpdateUserRoleCommand,
  ): Promise<UpdateUserRoleResponse> {
    return this.usecase.execute(actingUserUuid, targetUuid, command)
  }
}
