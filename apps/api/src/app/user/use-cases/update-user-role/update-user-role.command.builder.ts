import { UserRole } from '#src/app/user/enums/user-role.enum.js'
import { UpdateUserRoleCommand } from '#src/app/user/use-cases/update-user-role/update-user-role.command.js'

export class UpdateUserRoleCommandBuilder {
  private readonly command: UpdateUserRoleCommand

  constructor() {
    this.command = new UpdateUserRoleCommand()
    this.command.role = UserRole.Member
  }

  withRole(role: UserRole): this {
    this.command.role = role
    return this
  }

  build(): UpdateUserRoleCommand {
    return this.command
  }
}
