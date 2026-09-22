import type { NodeSummary } from '~/api/types.gen'
import { zViewNodeIndexResponse } from '~/api/zod.gen'

export function useNodeList() {
  const { $api } = useNuxtApp()

  async function list(): Promise<NodeSummary[]> {
    return zViewNodeIndexResponse.parse(await $api('/v1/nodes')).items
  }

  return { list }
}
