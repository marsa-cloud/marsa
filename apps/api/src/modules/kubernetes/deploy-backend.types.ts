import type { KubernetesObject, V1Deployment, V1Service } from '@kubernetes/client-node'

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
 * The fixed manifest bundle for one operator-app deploy (AgDR-0029). Rendered
 * purely from the `App`/`Release` model, then applied as a unit by a
 * `DeployBackend`. The three objects are always written together.
 */
export interface RenderedManifests {
  deployment: V1Deployment
  service: V1Service
  ingressRoute: IngressRoute
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
