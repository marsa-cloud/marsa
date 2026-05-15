export interface GetApiInfoResponse {
  name: string
  version: string
  commit: string | null
  nodeEnv: string
  uptimeSeconds: number
}
