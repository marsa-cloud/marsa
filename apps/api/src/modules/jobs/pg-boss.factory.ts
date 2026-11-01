import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { PgBoss } from 'pg-boss'
import { databaseUrl } from '#src/modules/database/database-url.js'

export function createPgBoss(config: ConfigService): PgBoss {
  const workersEnabled = config.getOrThrow<boolean>('JOBS_WORKER_ENABLED')
  const boss = new PgBoss({
    connectionString: databaseUrl(config),
    schema: 'pgboss',
    supervise: workersEnabled,
    schedule: workersEnabled,
  })
  const logger = new Logger('PgBoss')
  boss.on('error', (error) => logger.error(error.message, error.stack))
  return boss
}
