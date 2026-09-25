import { type DatabaseStatus } from '#src/modules/runtime/runtime.enums.js'
import type { DatabaseDeploySpec, DatabaseRef } from '#src/modules/runtime/runtime.types.js'

export abstract class DatabaseRuntime {
  // Provisions the database's environment too, so a hand-deleted one is healed.
  abstract provision(database: DatabaseRef, spec: DatabaseDeploySpec): Promise<void>

  // Idempotent: a retry after a partial teardown still completes, and it removes the data.
  abstract destroy(database: DatabaseRef): Promise<void>

  abstract readStatus(database: DatabaseRef): Promise<DatabaseStatus>
}
