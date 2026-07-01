import type { RenderedManifests } from '#src/modules/kubernetes/deploy-backend.types.js'

/**
 * Single seam for applying an operator app's manifest bundle to the cluster
 * (AgDR-0029). Consumers inject this abstract class; `KubernetesModule` binds it
 * to the real `DirectApplyDeployBackend` (server-side apply via
 * `@kubernetes/client-node`, AgDR-0031/0032) in production and to
 * `MockDeployBackend` in test/local (no cluster). Keeping rendering separate
 * from applying — and the GitOps-vs-own-operator fork behind this port — is the
 * #77 review checkpoint that keeps the V0.2 swap contained.
 */
export abstract class DeployBackend {
  /** Server-side-apply the Deployment + Service + IngressRoute bundle into `namespace`. */
  abstract apply(namespace: string, manifests: RenderedManifests): Promise<void>
}
