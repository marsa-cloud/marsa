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
    // Blocking self-change is what keeps an install from being locked out: the
    // acting operator always survives the edit, so at least one operator remains.
    if (actingUserUuid === targetUuid) {
      throw new BadRequestException('You cannot change your own role.')
    }

    const updated = await this.repository.updateRole(targetUuid, command.role)
    if (!updated) {
      throw new NotFoundException('No user with that uuid.')
    }
    return new UpdateUserRoleResponse(updated)
  }
}
