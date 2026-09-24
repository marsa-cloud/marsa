import { defineRelations } from 'drizzle-orm'
import * as schema from '#src/sql/schema.js'

export const relations = defineRelations(schema, (r) => ({
  projectTable: {
    environments: r.many.environmentTable(),
  },
  environmentTable: {
    project: r.one.projectTable({
      from: r.environmentTable.projectUuid,
      to: r.projectTable.uuid,
      optional: false,
    }),
    apps: r.many.appTable(),
    databases: r.many.databaseTable(),
  },
  databaseTable: {
    environment: r.one.environmentTable({
      from: r.databaseTable.environmentUuid,
      to: r.environmentTable.uuid,
      optional: false,
    }),
    attachments: r.many.databaseAttachmentTable(),
  },
  databaseAttachmentTable: {
    app: r.one.appTable({
      from: r.databaseAttachmentTable.appUuid,
      to: r.appTable.uuid,
      optional: false,
    }),
    database: r.one.databaseTable({
      from: r.databaseAttachmentTable.databaseUuid,
      to: r.databaseTable.uuid,
      optional: false,
    }),
  },
  appTable: {
    environment: r.one.environmentTable({
      from: r.appTable.environmentUuid,
      to: r.environmentTable.uuid,
      optional: false,
    }),
    releases: r.many.releaseTable(),
    attachments: r.many.databaseAttachmentTable(),
  },
  releaseTable: {
    app: r.one.appTable({
      from: r.releaseTable.appUuid,
      to: r.appTable.uuid,
      optional: false,
    }),
  },
  githubAppTable: {
    installations: r.many.githubInstallationTable(),
  },
  githubInstallationTable: {
    app: r.one.githubAppTable({
      from: r.githubInstallationTable.appUuid,
      to: r.githubAppTable.uuid,
      optional: false,
    }),
  },
}))
