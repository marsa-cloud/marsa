import type { V1Container, V1EnvVar, V1Service, V1StatefulSet } from '@kubernetes/client-node'
import { buildNodeAffinity } from '#src/modules/runtime/adapters/kubernetes/app/render/node-affinity.js'
import { DATA_VOLUME_NAME } from '#src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.constants.js'
import type {
  PersistentWorkloadSpec,
  RenderedPersistentWorkload,
} from '#src/modules/runtime/adapters/kubernetes/persistent/persistent-workload.types.js'

export function renderPersistentWorkload(spec: PersistentWorkloadSpec): RenderedPersistentWorkload {
  const name = spec.name
  const labels = { app: name }
  const affinity = buildNodeAffinity(spec.nodePin)

  const env: V1EnvVar[] = [
    ...Object.entries(spec.env).map(([key, value]) => ({ name: key, value })),
    ...spec.secretEnv.map((ref) => ({
      name: ref.name,
      valueFrom: { secretKeyRef: { name: ref.secret, key: ref.key } },
    })),
  ]

  const container: V1Container = {
    name,
    image: spec.image,
    ports: [{ containerPort: spec.port }],
    env,
    volumeMounts: [{ name: DATA_VOLUME_NAME, mountPath: spec.volume.mountPath }],
    readinessProbe: { exec: { command: spec.readinessExec } },
    livenessProbe: { tcpSocket: { port: spec.port } },
  }

  const statefulSet: V1StatefulSet = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name, labels },
    spec: {
      replicas: 1,
      serviceName: name,
      selector: { matchLabels: labels },
      // A persistent workload's volume IS its data, so removing the workload removes the data.
      persistentVolumeClaimRetentionPolicy: { whenDeleted: 'Delete', whenScaled: 'Delete' },
      volumeClaimTemplates: [
        {
          metadata: { name: DATA_VOLUME_NAME },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: spec.volume.storageClass,
            resources: { requests: { storage: `${spec.volume.sizeGib}Gi` } },
          },
        },
      ],
      template: {
        metadata: { labels },
        spec: {
          ...(affinity ? { affinity } : {}),
          containers: [container],
        },
      },
    },
  }

  const service: V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, labels },
    spec: {
      type: 'ClusterIP',
      selector: labels,
      ports: [{ port: spec.port, targetPort: spec.port }],
    },
  }

  return { statefulSet, service }
}
