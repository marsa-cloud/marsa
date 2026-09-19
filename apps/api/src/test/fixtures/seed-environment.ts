import { EnvironmentBuilder } from '#src/app/environment/entities/environment.builder.js'
import {
  type Environment,
  environmentTable,
} from '#src/app/environment/entities/environment.table.js'
import { ProjectBuilder } from '#src/app/project/entities/project.builder.js'
import { type Project, projectTable } from '#src/app/project/entities/project.table.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'

export async function seedEnvironment(
  db: Database,
): Promise<{ project: Project; environment: Environment }> {
  const project = new ProjectBuilder().build()
  const environment = new EnvironmentBuilder().withProject(project).build()
  await db.insert(projectTable).values(project)
  await db.insert(environmentTable).values(environment)
  return { project, environment }
}
