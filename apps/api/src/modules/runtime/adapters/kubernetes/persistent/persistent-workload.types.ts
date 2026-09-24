import type { V1Service, V1StatefulSet } from '@kubernetes/client-node'
import type { NodePinSpec, SecretEnvRef } from '#src/modules/runtime/runtime.types.js'

export type { SecretEnvRef }

export interface PersistentWorkloadSpec {
  name: string
  image: string
  port: number
  env: Record<string, string>
  secretEnv: SecretEnvRef[]
  volume: { mountPath: string; sizeGib: number; storageClass: string }
  readinessExec: string[]
  nodePin: NodePinSpec | null
}

export interface RenderedPersistentWorkload {
  statefulSet: V1StatefulSet
  service: V1Service
}
