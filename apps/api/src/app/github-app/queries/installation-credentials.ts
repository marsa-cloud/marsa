import { eq } from 'drizzle-orm'
import { githubAppTable } from '#src/app/github-app/entities/github-app.table.js'
import { githubInstallationTable } from '#src/app/github-app/entities/github-installation.table.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import type { Executor } from '#src/modules/database/drizzle.factory.js'

export interface InstallationCredentials {
  installationUuid: GitHubInstallationUuid
  installationId: string
  githubAppId: string
  privateKeyPemEnc: string
}

export function selectInstallationCredentials(db: Executor) {
  return db
    .select({
      installationUuid: githubInstallationTable.uuid,
      installationId: githubInstallationTable.installationId,
      githubAppId: githubAppTable.githubAppId,
      privateKeyPemEnc: githubAppTable.privateKeyPemEnc,
    })
    .from(githubInstallationTable)
    .innerJoin(githubAppTable, eq(githubInstallationTable.appUuid, githubAppTable.uuid))
}
