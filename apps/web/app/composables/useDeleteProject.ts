export function useDeleteProject() {
  const { $api } = useNuxtApp()

  async function remove(slug: string): Promise<void> {
    await $api(`/v1/projects/${encodeURIComponent(slug)}`, { method: 'DELETE' })
  }

  return { remove }
}
