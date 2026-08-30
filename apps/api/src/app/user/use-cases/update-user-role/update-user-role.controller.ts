import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Roles } from '#src/app/auth/decorators/roles.decorator.js'
import { CurrentUser } from '#src/app/user/decorators/current-user.decorator.js'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { UpdateUserRoleCommand } from '#src/app/user/use-cases/update-user-role/update-user-role.command.js'
import { UpdateUserRoleResponse } from '#src/app/user/use-cases/update-user-role/update-user-role.response.js'
import { UpdateUserRoleUseCase } from '#src/app/user/use-cases/update-user-role/update-user-role.use-case.js'
import { SESSION_COOKIE_SECURITY_SCHEME } from '#src/modules/swagger/build-api-documentation.js'

@ApiTags('users')
@Controller({ path: 'users/:uuid/role', version: '1' })
export class UpdateUserRoleController {
  constructor(private readonly usecase: UpdateUserRoleUseCase) {}

  @Patch()
  @Roles(UserRole.Operator)
  @ApiCookieAuth(SESSION_COOKIE_SECURITY_SCHEME)
  // Branded param types reflect as unknown, so Swagger emits no parameter without this.
  @ApiParam({ name: 'uuid', required: true, format: 'uuid', type: String })
  @ApiOkResponse({ type: UpdateUserRoleResponse })
  @ApiBadRequestResponse({
    description: 'Unknown role, a self-change, or demoting the last operator.',
  })
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
