import type { DeployReleaseResponse } from '~/api/types.gen'
import { zCreateReleaseResponse, zDeployReleaseResponse } from '~/api/zod.gen'

// Deploy, redeploy and rollback all mint a release, then deploy the app (its newest release).
export function useShipRelease() {
  const { $api } = useNuxtApp()

  async function ship(
    slug: string,
    options: { fromReleaseUuid?: string } = {},
  ): Promise<DeployReleaseResponse> {
    const path = `/v1/apps/${encodeURIComponent(slug)}`
    zCreateReleaseResponse.parse(await $api(`${path}/releases`, { method: 'POST', body: options }))
    const deployed = await $api(`${path}/deploy`, { method: 'POST' })
    return zDeployReleaseResponse.parse(deployed)
  }

  return { ship }
}
