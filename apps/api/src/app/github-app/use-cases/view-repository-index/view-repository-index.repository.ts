import { Injectable } from '@nestjs/common'
import { desc } from 'drizzle-orm'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import {
  type InstallationCredentials,
  selectInstallationCredentials,
} from '#src/app/github-app/queries/installation-credentials.js'
import type { Database } from '#src/modules/database/drizzle.factory.js'
import { InjectDatabase } from '#src/modules/database/inject-database.decorator.js'

@Injectable()
export class ViewRepositoryIndexRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  async findInstallation(): Promise<InstallationCredentials | undefined> {
    const [row] = await selectInstallationCredentials(this.db)
      .orderBy(desc(githubInstallationTable.uuid))
      .limit(1)
    return row
  }
}
