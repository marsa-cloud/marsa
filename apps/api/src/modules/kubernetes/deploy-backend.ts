import type {
  AppHealth,
  DeployFailure,
  RenderedManifests,
  RunLogs,
  RunLogsOptions,
} from '#src/modules/kubernetes/deploy-backend.types.js'
import type { RolloutStatus } from '#src/modules/kubernetes/rollout-status.js'

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

  /**
   * Read a Deployment's rollout outcome (#100). Returns a neutral
   * {@link RolloutStatus}; `NotFound` when the Deployment does not exist.
   */
  abstract readRolloutStatus(namespace: string, deploymentName: string): Promise<RolloutStatus>

  /** Live runtime-health snapshot of a Deployment (#100) — never stored. */
  abstract readAppHealth(namespace: string, deploymentName: string): Promise<AppHealth>

  /**
   * Why the app's current pods are failing (#115) — image pull, crash, config.
   * Live-derived, never stored; `null` when nothing is failing (or the
   * Deployment / its pods can't be found). Read only when a rollout has already
   * failed, to explain *why*.
   */
  abstract readDeployFailure(
    namespace: string,
    deploymentName: string,
  ): Promise<DeployFailure | null>

  /**
   * A recent run-log snapshot from the app's newest pod (#114) — the tail of its
   * stdout/stderr. Live-read, never stored; `null` when the Deployment or its
   * pods can't be found.
   */
  abstract readRunLogs(
    namespace: string,
    deploymentName: string,
    options: RunLogsOptions,
  ): Promise<RunLogs | null>
}
