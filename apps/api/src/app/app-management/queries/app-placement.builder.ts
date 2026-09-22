import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppPlacement } from '#src/app/app-management/queries/app-placement.js'
import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'

export class AppPlacementBuilder {
  private readonly placement: AppPlacement

  constructor() {
    const project = new ProjectBuilder().build()
    const environment = new EnvironmentBuilder().withProject(project).build()
    this.placement = {
      app: new AppBuilder().withEnvironmentUuid(environment.uuid).build(),
      environment,
      project,
    }
  }

  withApp(app: App): this {
    this.placement.app = { ...app, environmentUuid: this.placement.environment.uuid }
    return this
  }

  build(): AppPlacement {
    return this.placement
  }
}
