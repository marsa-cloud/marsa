import { UpdateAppEnvCommand } from '#src/app/app-management/use-cases/update-app-env/update-app-env.command.js'

/** Fluent builder for {@link UpdateAppEnvCommand}; constructor seeds a valid default set. */
export class UpdateAppEnvCommandBuilder {
  private readonly command: UpdateAppEnvCommand

  constructor() {
    this.command = new UpdateAppEnvCommand()
    this.command.env = { LOG_LEVEL: 'info' }
  }

  withEnv(env: Record<string, string>): this {
    this.command.env = env
    return this
  }

  build(): UpdateAppEnvCommand {
    return this.command
  }
}
