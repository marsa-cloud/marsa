import { DatabaseEngine } from '#src/app/database/enums/database-engine.enum.js'

export interface ConnectionDetails {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface EngineCatalogueEntry {
  image: string
  port: number
  dataMountPath: string
  env: Record<string, string>
  credentialEnv: Array<{ name: string; key: string }>
  readinessExec: string[]
  publishedVariables: (connection: ConnectionDetails) => Record<string, string>
}

const POSTGRES_CREDENTIAL_ENV = [
  { name: 'POSTGRES_USER', key: 'PGUSER' },
  { name: 'POSTGRES_PASSWORD', key: 'PGPASSWORD' },
  { name: 'POSTGRES_DB', key: 'PGDATABASE' },
]

const postgresPublishedVariables = ({
  host,
  port,
  user,
  password,
  database,
}: ConnectionDetails): Record<string, string> => ({
  DATABASE_URL: `postgres://${user}:${password}@${host}:${port}/${database}`,
  PGHOST: host,
  PGPORT: String(port),
  PGUSER: user,
  PGPASSWORD: password,
  PGDATABASE: database,
})

const postgres = (image: string, dataMountPath: string, pgData: string): EngineCatalogueEntry => ({
  image,
  port: 5432,
  dataMountPath,
  // A local-path directory can hold entries initdb refuses to start in, so PGDATA is a subdir.
  env: { PGDATA: pgData },
  credentialEnv: POSTGRES_CREDENTIAL_ENV,
  // Over TCP, since initdb's temporary server answers on the socket only; unready while recovering.
  readinessExec: ['pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
  publishedVariables: postgresPublishedVariables,
})

const CATALOGUE: Record<DatabaseEngine, Record<string, EngineCatalogueEntry>> = {
  [DatabaseEngine.Postgres]: {
    '16': postgres('postgres:16.15', '/var/lib/postgresql/data', '/var/lib/postgresql/data/pgdata'),
    '17': postgres('postgres:17.11', '/var/lib/postgresql/data', '/var/lib/postgresql/data/pgdata'),
    // 18 moved PGDATA to a version-specific path and the VOLUME up one level.
    '18': postgres('postgres:18.6', '/var/lib/postgresql', '/var/lib/postgresql/18/docker'),
  },
}

export const SUPPORTED_MAJORS: Record<DatabaseEngine, string[]> = {
  [DatabaseEngine.Postgres]: Object.keys(CATALOGUE[DatabaseEngine.Postgres]),
}

export function catalogueEntry(
  engine: DatabaseEngine,
  version: string,
): EngineCatalogueEntry | undefined {
  return CATALOGUE[engine][version]
}
