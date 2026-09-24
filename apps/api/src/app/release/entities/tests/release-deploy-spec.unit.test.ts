import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { DatabaseEngine } from '#src/app/database-management/enums/database-engine.enum.js'
import type { AttachedDatabase } from '#src/app/database-management/queries/app-attachments.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { NodePinStrategy } from '#src/modules/runtime/runtime.enums.js'

describe('deploySpecOf', () => {
  const shipped = new AppBuilder()
    .withSlug('my-app')
    .withImage('nginx:1.27')
    .withContainerPort(8080)
    .withEnv({ OLD: '1' })
    .build()
  const release = new ReleaseBuilder().withApp(shipped).build()
  const placement = new AppPlacementBuilder()
    .withApp({
      ...shipped,
      image: 'nginx:1.28',
      containerPort: 9090,
      env: { NEW: '1' },
      nodePin: {
        key: 'kubernetes.io/hostname',
        values: ['node-a'],
        strategy: PinStrategy.Preferred,
      },
    })
    .build()

  it('takes workload config from the release and placement from the app', () => {
    const spec = deploySpecOf(placement, release, { baseDomain: 'demo.marsa.cc', attachments: [] })

    expect(spec).toEqual({
      releaseUuid: release.uuid,
      image: 'nginx:1.27',
      port: 8080,
      env: { OLD: '1' },
      attachments: [],
      minReplicas: release.minReplicas,
      maxReplicas: release.maxReplicas,
      host: 'my-app.demo.marsa.cc',
      nodePin: {
        key: 'kubernetes.io/hostname',
        values: ['node-a'],
        strategy: NodePinStrategy.Preferred,
      },
    })
  })

  it('carries credentials only when given', () => {
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }

    const spec = deploySpecOf(placement, release, { baseDomain: 'x', attachments: [], credentials })

    expect(spec.credentials).toEqual(credentials)
    expect(
      'credentials' in deploySpecOf(placement, release, { baseDomain: 'x', attachments: [] }),
    ).toBe(false)
  })

  const attached = (over: Partial<AttachedDatabase> = {}): AttachedDatabase => ({
    alias: null,
    databaseSlug: 'orders',
    engine: DatabaseEngine.Postgres,
    version: '17',
    ...over,
  })

  it('resolves an unprefixed attachment to the engine keys with no prefix', () => {
    const spec = deploySpecOf(placement, release, {
      baseDomain: 'demo.marsa.cc',
      attachments: [attached()],
    })

    expect(spec.attachments).toEqual([
      {
        databaseSlug: 'orders',
        envPrefix: null,
        keys: ['DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'],
      },
    ])
  })

  it('uppercases an alias into an env prefix', () => {
    const spec = deploySpecOf(placement, release, {
      baseDomain: 'demo.marsa.cc',
      attachments: [attached({ alias: 'analytics-db', databaseSlug: 'analytics-db' })],
    })

    expect(spec.attachments[0]?.envPrefix).toBe('ANALYTICS_DB_')
  })

  it('drops an app env entry the attachment overrides, keeping the rest', () => {
    const withEnv = {
      ...release,
      env: { DATABASE_URL: 'postgres://hand-written', LOG_LEVEL: 'info' },
    }

    const spec = deploySpecOf(placement, withEnv, {
      baseDomain: 'demo.marsa.cc',
      attachments: [attached()],
    })

    expect(spec.env).toEqual({ LOG_LEVEL: 'info' })
  })

  it('only drops the names the prefix actually claims', () => {
    const withEnv = {
      ...release,
      env: { DATABASE_URL: 'keep-me', ANALYTICS_DATABASE_URL: 'drop-me' },
    }

    const spec = deploySpecOf(placement, withEnv, {
      baseDomain: 'demo.marsa.cc',
      attachments: [attached({ alias: 'analytics', databaseSlug: 'analytics' })],
    })

    expect(spec.env).toEqual({ DATABASE_URL: 'keep-me' })
  })

  it('carries two attachments at once', () => {
    const spec = deploySpecOf(placement, release, {
      baseDomain: 'demo.marsa.cc',
      attachments: [attached(), attached({ alias: 'analytics', databaseSlug: 'analytics' })],
    })

    expect(spec.attachments.map((a) => a.envPrefix)).toEqual([null, 'ANALYTICS_'])
  })

  it('ignores an attachment whose engine version left the catalogue', () => {
    const spec = deploySpecOf(placement, release, {
      baseDomain: 'demo.marsa.cc',
      attachments: [attached({ version: '15' })],
    })

    expect(spec.attachments).toEqual([])
  })
})
