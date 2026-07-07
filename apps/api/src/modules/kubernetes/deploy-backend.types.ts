import type { KubernetesObject, V1Deployment, V1Secret, V1Service } from '@kubernetes/client-node'

/** Spec of a Traefik `IngressRoute` (traefik.io/v1alpha1) — a CRD with no typed model. */
export interface IngressRouteSpec {
  entryPoints: string[]
  routes: Array<{
    match: string
    kind: 'Rule'
    services: Array<{ name: string; port: number }>
  }>
  tls?: { certResolver: string }
}

/** A Traefik `IngressRoute` custom resource. */
export type IngressRoute = KubernetesObject & { spec: IngressRouteSpec }

/**
 * Decrypted registry credentials, held in memory only while rendering a private
 * image's pull Secret (#99, AgDR-0036). At rest these are AES-256-GCM ciphertext
 * on `App.imagePullCredentialsEnc`; this shape is the decrypted form the render
 * step consumes. `password` carries a password or access token (PAT / API key).
 */
export interface RegistryCredentials {
  registry: string
  username: string
  password: string
}

/**
 * The manifest bundle for one operator-app deploy (AgDR-0029). Rendered purely
 * from the `App`/`Release` model, then applied as a unit by a `DeployBackend`.
 * The Deployment + Service + IngressRoute are always written together; the
 * `imagePullSecret` is present only for private images (#99, AgDR-0036).
 */
export interface RenderedManifests {
  deployment: V1Deployment
  service: V1Service
  ingressRoute: IngressRoute
  imagePullSecret?: V1Secret
}

/**
 * Neutral, live runtime-health snapshot of an app's Deployment (#100). Never
 * stored — read on request. Keeps k8s types inside the kubernetes module: the
 * feature maps this to its own health verdict. `found: false` means the
 * Deployment does not exist (yet, or was deleted).
 */
export interface AppHealth {
  found: boolean
  desiredReplicas: number
  availableReplicas: number
  updatedReplicas: number
}

/**
 * Why a deploy failed (#115) — the first failing container state found on an
 * app's pods (image pull, crash, config error). Live-derived on read, never
 * stored. The port returns `null` when no failing container is observed.
 */
export interface DeployFailure {
  /** K8s waiting/terminated reason, e.g. `ImagePullBackOff`, `CrashLoopBackOff`. */
  reason: string
  message: string
}

/**
 * A recent run-log snapshot for an app (#114) — the tail of one live pod's
 * stdout/stderr. Live-read, never stored. The port returns `null` when the
 * Deployment or its pods can't be found.
 */
export interface RunLogs {
  /** Name of the pod the log was read from (the newest pod of the app's Deployment). */
  podName: string
  logs: string
}

/** Bounds for a run-log read (#114). `tailLines` caps how many trailing lines are returned. */
export interface RunLogsOptions {
  tailLines: number
}
