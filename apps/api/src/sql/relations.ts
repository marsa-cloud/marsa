import { defineRelations } from 'drizzle-orm'
import * as schema from '#src/sql/schema.js'

export const relations = defineRelations(schema, (r) => ({
  appTable: {
    releases: r.many.releaseTable(),
  },
  releaseTable: {
    app: r.one.appTable({
      from: r.releaseTable.appUuid,
      to: r.appTable.uuid,
      optional: false,
    }),
  },
}))
