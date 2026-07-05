import type { V1Deployment, V1Pod, V1ReplicaSet } from '@kubernetes/client-node'

/**
 * The set of object names whose K8s Events belong to one app's rollout (#115):
 * the Deployment, the ReplicaSet(s) it owns, and the Pods those ReplicaSets own.
 *
 * Membership is resolved by `ownerReferences[].uid`, never by name prefix — a
 * sibling app whose name shares a prefix (`my-app` vs `my-app-2`) owns different
 * objects, so its events must not bleed into these results. Pure and total
 * (never throws on partial objects), so the cluster-I/O that fetches the lists
 * lives in {@link DirectApplyDeployBackend} and this stays unit-tested.
 */
export function resolveRolloutObjectNames(
  deployment: V1Deployment,
  replicaSets: V1ReplicaSet[],
  pods: V1Pod[],
): Set<string> {
  const names = new Set<string>()

  const deploymentName = deployment.metadata?.name
  if (deploymentName) {
    names.add(deploymentName)
  }
  const deploymentUid = deployment.metadata?.uid

  const ownedReplicaSetUids = new Set<string>()
  for (const replicaSet of replicaSets) {
    const ownsThis = replicaSet.metadata?.ownerReferences?.some((ref) => ref.uid === deploymentUid)
    if (!ownsThis) {
      continue
    }
    const name = replicaSet.metadata?.name
    if (name) {
      names.add(name)
    }
    const uid = replicaSet.metadata?.uid
    if (uid) {
      ownedReplicaSetUids.add(uid)
    }
  }

  for (const pod of pods) {
    const ownedByRollout = pod.metadata?.ownerReferences?.some((ref) =>
      ownedReplicaSetUids.has(ref.uid),
    )
    const name = pod.metadata?.name
    if (ownedByRollout && name) {
      names.add(name)
    }
  }

  return names
}
