export const PUSH_EVENT = 'push'

const BRANCH_REF_PREFIX = 'refs/heads/'

export interface GitHubPush {
  installationId: string
  repo: string
  branch: string
  commitSha: string
}

interface PushPayload {
  ref?: unknown
  after?: unknown
  deleted?: unknown
  repository?: { full_name?: unknown } | null
  installation?: { id?: unknown } | null
}

const asPayload = (payload: unknown): PushPayload =>
  typeof payload === 'object' && payload !== null ? (payload as PushPayload) : {}

export function installationIdOf(payload: unknown): string | null {
  const id = asPayload(payload).installation?.id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

export function readBranchPush(payload: unknown): GitHubPush | null {
  const push = asPayload(payload)
  const installationId = installationIdOf(payload)
  const repo = push.repository?.full_name
  if (
    push.deleted === true ||
    typeof push.ref !== 'string' ||
    !push.ref.startsWith(BRANCH_REF_PREFIX) ||
    typeof push.after !== 'string' ||
    typeof repo !== 'string' ||
    !installationId
  ) {
    return null
  }
  return {
    installationId,
    repo,
    branch: push.ref.slice(BRANCH_REF_PREFIX.length),
    commitSha: push.after,
  }
}
