import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'

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
    const { app, spec } = deploySpecOf(placement, release, { baseDomain: 'demo.marsa.cc' })

    expect(app).toEqual({
      slug: 'my-app',
      environment: {
        uuid: placement.environment.uuid,
        projectSlug: placement.project.slug,
        environmentSlug: placement.environment.slug,
      },
    })
    expect(spec).toEqual({
      releaseUuid: release.uuid,
      image: 'nginx:1.27',
      port: 8080,
      env: { OLD: '1' },
      minReplicas: release.minReplicas,
      maxReplicas: release.maxReplicas,
      host: 'my-app.demo.marsa.cc',
      nodePin: { key: 'kubernetes.io/hostname', values: ['node-a'], strategy: 'preferred' },
    })
  })

  it('carries credentials only when given', () => {
    const credentials = { registry: 'ghcr.io', username: 'org', password: 'pw' }

    const { spec } = deploySpecOf(placement, release, { baseDomain: 'x', credentials })

    expect(spec.credentials).toEqual(credentials)
    expect('credentials' in deploySpecOf(placement, release, { baseDomain: 'x' }).spec).toBe(false)
  })
})
