import type { Uuid } from '#src/utils/uuid.js'

export interface EnvironmentRef {
  project: { slug: string }
  environment: { uuid: Uuid<'Environment'>; slug: string }
}

export interface AppRef extends EnvironmentRef {
  app: { slug: string }
}

export enum NodePinStrategy {
  Required = 'required',
  Preferred = 'preferred',
}

export interface NodePinSpec {
  key: string
  values: string[]
  strategy: NodePinStrategy
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

export interface DatabaseRef extends EnvironmentRef {
  database: { slug: string }
}

// Decrypted, held in memory only for the length of a provision (AgDR-0036).
export interface DatabaseCredentials {
  user: string
  password: string
  database: string
}

export interface DatabaseDeploySpec {
  image: string
  port: number
  dataMountPath: string
  env: Record<string, string>
  // Env the engine image reads its init values from, keyed by published-variable name.
  credentialEnv: Array<{ name: string; key: string }>
  publishedVariables: Record<string, string>
  storageGib: number
  storageClass: string
  readinessExec: string[]
  nodePin: NodePinSpec | null
}

export enum DatabaseStatus {
  Provisioning = 'provisioning',
  Ready = 'ready',
  Failed = 'failed',
  NotFound = 'not_found',
}
