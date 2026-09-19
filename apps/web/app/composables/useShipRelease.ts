import type { DeployReleaseResponse } from '~/api/types.gen'
import { zCreateReleaseResponse, zDeployReleaseResponse } from '~/api/zod.gen'

// Deploy, redeploy and rollback are all "mint a release, then deploy that exact release".
export function useShipRelease() {
  const { $api } = useNuxtApp()

  async function ship(
    slug: string,
    options: { fromReleaseUuid?: string } = {},
  ): Promise<DeployReleaseResponse> {
    const created = zCreateReleaseResponse.parse(
      await $api(`/v1/apps/${encodeURIComponent(slug)}/releases`, { method: 'POST', body: options }),
    )
    const deployed = await $api(`/v1/releases/${encodeURIComponent(created.releaseUuid)}/deploy`, {
      method: 'POST',
    })
    return zDeployReleaseResponse.parse(deployed)
  }

  return { ship }
}
