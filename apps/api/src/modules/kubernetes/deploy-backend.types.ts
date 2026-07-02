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
