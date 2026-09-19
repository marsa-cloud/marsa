import type { App } from '#src/app/app-management/entities/app.table.js'
import type { Release } from '#src/app/release/entities/release.table.js'

export type ReleaseSnapshot = Pick<
  Release,
  'imageRef' | 'env' | 'containerPort' | 'minReplicas' | 'maxReplicas' | 'imagePullCredentialsEnc'
>

export type AppConfig = Pick<
  App,
  'image' | 'env' | 'containerPort' | 'minReplicas' | 'maxReplicas' | 'imagePullCredentialsEnc'
>

export function snapshotOf(app: AppConfig): ReleaseSnapshot {
  return {
    imageRef: app.image,
    env: app.env,
    containerPort: app.containerPort,
    minReplicas: app.minReplicas,
    maxReplicas: app.maxReplicas,
    imagePullCredentialsEnc: app.imagePullCredentialsEnc,
  }
}

export function appConfigOf(snapshot: ReleaseSnapshot): AppConfig {
  return {
    image: snapshot.imageRef,
    env: snapshot.env,
    containerPort: snapshot.containerPort,
    minReplicas: snapshot.minReplicas,
    maxReplicas: snapshot.maxReplicas,
    imagePullCredentialsEnc: snapshot.imagePullCredentialsEnc,
  }
}

const canonicalEnv = (env: Record<string, string>) =>
  JSON.stringify(Object.entries(env).sort(([a], [b]) => (a < b ? -1 : 1)))

export function isSnapshotOf(snapshot: ReleaseSnapshot, app: AppConfig): boolean {
  return (
    snapshot.imageRef === app.image &&
    snapshot.containerPort === app.containerPort &&
    snapshot.minReplicas === app.minReplicas &&
    snapshot.maxReplicas === app.maxReplicas &&
    snapshot.imagePullCredentialsEnc === app.imagePullCredentialsEnc &&
    canonicalEnv(snapshot.env) === canonicalEnv(app.env)
  )
}
