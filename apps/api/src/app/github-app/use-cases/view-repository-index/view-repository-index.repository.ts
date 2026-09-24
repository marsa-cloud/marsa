import { Injectable } from '@nestjs/common'
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

  // One row per GitHub account or org the App is installed on; there are only ever a handful.
  async findInstallations(): Promise<InstallationCredentials[]> {
    return selectInstallationCredentials(this.db).orderBy(githubInstallationTable.uuid)
  }
}
