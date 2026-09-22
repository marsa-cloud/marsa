import type { Uuid } from '#src/utils/uuid.js'

export interface EnvironmentRef {
  uuid: Uuid<'Environment'>
  projectSlug: string
  environmentSlug: string
}

export interface AppRef {
  environment: EnvironmentRef
  slug: string
}

export type PinStrategySpec = 'required' | 'preferred'

export interface NodePinSpec {
  key: string
  values: string[]
  strategy: PinStrategySpec
}

// Decrypted, held in memory only for the length of a deploy (AgDR-0036).
export interface RegistryCredentials {
  registry: string
  username: string
  password: string
}

export interface AppDeploySpec {
  releaseUuid: Uuid<'Release'>
  image: string
  port: number
  env: Record<string, string>
  minReplicas: number
  maxReplicas: number
  host: string
  nodePin: NodePinSpec | null
  credentials?: RegistryCredentials
}

// NotFound is absence of observation, not a state — never persist a terminal outcome from it.
export enum RolloutStatus {
  Complete = 'complete',
  Failed = 'failed',
  Progressing = 'progressing',
  NotFound = 'not_found',
}

export interface AppHealth {
  found: boolean
  desiredReplicas: number
  availableReplicas: number
  updatedReplicas: number
}

export interface DeployFailure {
  reason: string
  message: string
}

export interface RunLogs {
  podName: string
  logs: string
}

export interface RunLogsOptions {
  tailLines: number
}

export interface ClusterNode {
  name: string
  labels: Record<string, string>
  ready: boolean
}
