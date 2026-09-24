import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import type { App } from '#src/app/app-management/entities/app.table.js'
import { PinStrategy } from '#src/app/app-management/enums/pin-strategy.enum.js'
import { AppPlacementBuilder } from '#src/app/app-management/queries/app-placement.builder.js'
import type { GitHubInstallationUuid } from '#src/app/github-app/entities/github-installation.uuid.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import { deploySpecOf } from '#src/app/release/entities/release-deploy-spec.js'
import { NodePinStrategy } from '#src/modules/runtime/runtime.types.js'
import { generateUuid } from '#src/utils/uuid.js'

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
    const spec = deploySpecOf(placement, release, { baseDomain: 'demo.marsa.cc' })

    expect(spec).toEqual({
      releaseUuid: release.uuid,
      image: 'nginx:1.27',
      port: 8080,
      env: { OLD: '1' },
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

    const spec = deploySpecOf(placement, release, { baseDomain: 'x', credentials })

    expect(spec.credentials).toEqual(credentials)
    expect('credentials' in deploySpecOf(placement, release, { baseDomain: 'x' })).toBe(false)
  })
})

describe('deploySpecOf and $PORT', () => {
  const source = {
    type: 'github' as const,
    installationUuid: generateUuid<GitHubInstallationUuid>(),
    repo: 'acme/shop',
    branch: 'main',
    rootDir: '.',
    dockerfilePath: 'Dockerfile',
  }
  const specOf = (app: App) =>
    deploySpecOf(
      new AppPlacementBuilder().withApp(app).build(),
      new ReleaseBuilder().withApp(app).build(),
      { baseDomain: 'demo.marsa.cc' },
    )

  it('tells a source app which port to listen on', () => {
    const app = new AppBuilder()
      .withSource(source)
      .withContainerPort(8080)
      .withEnv({ A: '1' })
      .build()

    expect(specOf(app).env).toEqual({ A: '1', PORT: '8080' })
  })

  it("keeps the user's own PORT", () => {
    const app = new AppBuilder()
      .withSource(source)
      .withContainerPort(8080)
      .withEnv({ PORT: '3000' })
      .build()

    expect(specOf(app).env).toEqual({ PORT: '3000' })
  })

  it('leaves an image app alone', () => {
    const app = new AppBuilder().withContainerPort(80).withEnv({ A: '1' }).build()

    expect(specOf(app).env).toEqual({ A: '1' })
  })
})
