import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { UserUuid } from '#src/app/user/entities/user.uuid.js'
import { UpdateUserRoleCommand } from '#src/app/user/use-cases/update-user-role/update-user-role.command.js'
import { UpdateUserRoleRepository } from '#src/app/user/use-cases/update-user-role/update-user-role.repository.js'
import { UpdateUserRoleResponse } from '#src/app/user/use-cases/update-user-role/update-user-role.response.js'

@Injectable()
export class UpdateUserRoleUseCase {
  constructor(private readonly repository: UpdateUserRoleRepository) {}

  async execute(
    actingUserUuid: UserUuid,
    targetUuid: UserUuid,
    command: UpdateUserRoleCommand,
  ): Promise<UpdateUserRoleResponse> {
    // Compared case-insensitively: ParseUUIDPipe accepts any case and does not normalise,
    // while Postgres matches uuids case-insensitively — a plain === lets an uppercased
    // uuid slip past this check and edit the caller's own row.
    if (actingUserUuid.toLowerCase() === targetUuid.toLowerCase()) {
      throw new BadRequestException('You cannot change your own role.')
    }

    const outcome = await this.repository.updateRole(targetUuid, command.role)
    if (outcome.status === 'not-found') {
      throw new NotFoundException('No user with that uuid.')
    }
    if (outcome.status === 'last-operator') {
      throw new BadRequestException('Cannot demote the last operator.')
    }
    return new UpdateUserRoleResponse(outcome.user)
  }
}
