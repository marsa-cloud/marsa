import { describe, it } from 'node:test'
import { expect } from 'expect'
import { AppBuilder } from '#src/app/app-management/entities/app.builder.js'
import { ReleaseBuilder } from '#src/app/release/entities/release.builder.js'
import {
  appConfigOf,
  isSnapshotOf,
  snapshotOf,
} from '#src/app/release/entities/release-snapshot.js'

const app = () =>
  new AppBuilder()
    .withImage('nginx:1.27')
    .withContainerPort(8080)
    .withMinReplicas(0)
    .withMaxReplicas(3)
    .withEnv({ A: '1', B: '2' })
    .withImagePullCredentialsEnc('sealed')
    .build()

describe('release snapshot', () => {
  it('round-trips app config through a snapshot', () => {
    const config = app()
    expect(appConfigOf(snapshotOf(config))).toEqual({
      image: 'nginx:1.27',
      containerPort: 8080,
      minReplicas: 0,
      maxReplicas: 3,
      env: { A: '1', B: '2' },
      imagePullCredentialsEnc: 'sealed',
    })
  })

  it('matches regardless of env key order', () => {
    const config = app()
    expect(isSnapshotOf({ ...snapshotOf(config), env: { B: '2', A: '1' } }, config)).toBe(true)
  })

  it('detects each changed field', () => {
    const config = app()
    const base = snapshotOf(config)
    expect(isSnapshotOf({ ...base, imageRef: 'nginx:1.28' }, config)).toBe(false)
    expect(isSnapshotOf({ ...base, containerPort: 80 }, config)).toBe(false)
    expect(isSnapshotOf({ ...base, minReplicas: 1 }, config)).toBe(false)
    expect(isSnapshotOf({ ...base, maxReplicas: 4 }, config)).toBe(false)
    expect(isSnapshotOf({ ...base, env: { A: '1' } }, config)).toBe(false)
    expect(isSnapshotOf({ ...base, imagePullCredentialsEnc: null }, config)).toBe(false)
  })

  it('ReleaseBuilder.withApp copies the app snapshot', () => {
    const config = app()
    const release = new ReleaseBuilder().withApp(config).build()
    expect(isSnapshotOf(release, config)).toBe(true)
    expect(release.sourceReleaseUuid).toBeNull()
  })
})

describe('snapshotOf an app with no image', () => {
  it('refuses, because a release must name an image', () => {
    const app = new AppBuilder().withImage(null).build()

    expect(() => snapshotOf(app)).toThrow('no image')
  })
})
