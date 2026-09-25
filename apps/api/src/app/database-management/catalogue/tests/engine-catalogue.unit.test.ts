import { describe, it } from 'node:test'
import { expect } from 'expect'
import {
  catalogueEntry,
  SUPPORTED_MAJORS,
} from '#src/app/database-management/catalogue/engine-catalogue.js'
import { DatabaseEngine } from '#src/app/database-management/enums/database-engine.enum.js'

describe('engine catalogue', () => {
  it('offers exactly the supported Postgres majors', () => {
    expect(SUPPORTED_MAJORS[DatabaseEngine.Postgres]).toEqual(['16', '17', '18'])
  })

  it('pins an exact tag per major so a reschedule is deterministic', () => {
    expect(catalogueEntry(DatabaseEngine.Postgres, '17')?.image).toBe('postgres:17.11')
  })

  it('mounts the pre-18 data path with PGDATA in a subdirectory', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '17')

    expect(entry?.dataMountPath).toBe('/var/lib/postgresql/data')
    expect(entry?.env.PGDATA).toBe('/var/lib/postgresql/data/pgdata')
  })

  it('uses the version-specific data path that Postgres 18 moved to', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '18')

    expect(entry?.dataMountPath).toBe('/var/lib/postgresql')
    expect(entry?.env.PGDATA).toBe('/var/lib/postgresql/18/docker')
  })

  it('publishes a composed connection string plus the libpq variables', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '17')

    expect(
      entry?.publishedVariables({
        host: 'orders',
        port: 5432,
        user: 'postgres',
        password: 'abc123',
        database: 'orders',
      }),
    ).toEqual({
      DATABASE_URL: 'postgres://postgres:abc123@orders:5432/orders',
      PGHOST: 'orders',
      PGPORT: '5432',
      PGUSER: 'postgres',
      PGPASSWORD: 'abc123',
      PGDATABASE: 'orders',
    })
  })

  it('returns undefined for a major it does not carry', () => {
    expect(catalogueEntry(DatabaseEngine.Postgres, '15')).toBeUndefined()
  })

  it('publishes its variable names without needing a connection to name them', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '17')

    expect(entry?.publishedKeys).toEqual([
      'DATABASE_URL',
      'PGHOST',
      'PGPORT',
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
    ])
  })

  it('keeps publishedKeys in step with what publishedVariables actually returns', () => {
    const entry = catalogueEntry(DatabaseEngine.Postgres, '17')
    const produced = entry?.publishedVariables({
      host: 'h',
      port: 5432,
      user: 'u',
      password: 'p',
      database: 'd',
    })

    expect(Object.keys(produced ?? {}).sort()).toEqual([...(entry?.publishedKeys ?? [])].sort())
  })
})
