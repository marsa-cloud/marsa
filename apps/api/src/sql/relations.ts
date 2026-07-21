import { defineRelations } from 'drizzle-orm'
import * as schema from '#src/sql/schema.js'

export const relations = defineRelations(schema)
