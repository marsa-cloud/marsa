import type { KubernetesObject, V1Deployment, V1Secret, V1Service } from '@kubernetes/client-node'

/**
 * A backend of a Traefik `IngressRoute` route. `namespace` targets a Service in
 * another namespace, which requires Traefik's `allowCrossNamespace`.
 */
export interface IngressRouteService {
  name: string
  port: number
  namespace?: string
}

/** Spec of a Traefik `IngressRoute` (traefik.io/v1alpha1) — a CRD with no typed model. */
export interface IngressRouteSpec {
  entryPoints: string[]
  routes: Array<{
    match: string
    kind: 'Rule'
    services: IngressRouteService[]
  }>
  tls?: { certResolver: string }
}

/** A Traefik `IngressRoute` custom resource. */
export type IngressRoute = KubernetesObject & { spec: IngressRouteSpec }

/**
 * A KEDA HTTP add-on `HTTPScaledObject` — the CRD that makes an app scalable
 * from zero on HTTP traffic. Shapes match the add-on version installed by
 * `scripts/install.sh`; the schema has changed across releases, so these fields
 * are pinned to what that version's CRD actually accepts (AgDR-0043).
 */
export interface HttpScaledObjectSpec {
  hosts: string[]
  scaleTargetRef: {
    name: string
    kind: string
    apiVersion: string
    service: string
    port: number
  }
  replicas: { min: number; max: number }
  scaledownPeriod: number
}

/** A KEDA HTTP add-on `HTTPScaledObject` custom resource. */
export type HttpScaledObject = KubernetesObject & { spec: HttpScaledObjectSpec }

/**
 * The manifest bundle for one operator-app deploy (AgDR-0029). Rendered purely
 * from an `AppDeploySpec`, then applied as a unit by `KubernetesAppRuntime`.
 * The Deployment + Service + IngressRoute + HTTPScaledObject are always written
 * together; the `imagePullSecret` is present only for private images (#99,
 * AgDR-0036).
 */
export interface RenderedManifests {
  deployment: V1Deployment
  service: V1Service
  ingressRoute: IngressRoute
  httpScaledObject: HttpScaledObject
  imagePullSecret?: V1Secret
}
