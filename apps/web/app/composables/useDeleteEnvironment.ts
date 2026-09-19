export function useDeleteEnvironment() {
  const { $api } = useNuxtApp()

  async function remove(projectSlug: string, environmentSlug: string): Promise<void> {
    const path = `/v1/projects/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(environmentSlug)}`
    await $api(path, { method: 'DELETE' })
  }

  return { remove }
}
