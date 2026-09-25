import type { App } from '#src/app/app-management/entities/app.table.js'
import type { AppUuid } from '#src/app/app-management/entities/app.uuid.js'
import type { DatabaseRow } from '#src/app/database-management/entities/database.table.js'
import type { DatabaseUuid } from '#src/app/database-management/entities/database.uuid.js'
import type { DatabaseAttachmentRow } from '#src/app/database-management/entities/database-attachment.table.js'
import type { DatabaseAttachmentUuid } from '#src/app/database-management/entities/database-attachment.uuid.js'
import { generateUuid } from '#src/utils/uuid.js'

export class DatabaseAttachmentBuilder {
  private readonly attachment: DatabaseAttachmentRow

  constructor() {
    const now = new Date()
    this.attachment = {
      uuid: generateUuid<DatabaseAttachmentUuid>(),
      appUuid: generateUuid<AppUuid>(),
      databaseUuid: generateUuid<DatabaseUuid>(),
      alias: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  withApp(app: App): this {
    this.attachment.appUuid = app.uuid
    return this
  }

  withDatabase(database: DatabaseRow): this {
    this.attachment.databaseUuid = database.uuid
    return this
  }

  withAlias(alias: string | null): this {
    this.attachment.alias = alias
    return this
  }

  build(): DatabaseAttachmentRow {
    return this.attachment
  }
}
