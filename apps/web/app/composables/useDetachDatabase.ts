/** The endpoint answers 204 with no body to parse. */
export function useDetachDatabase() {
  const { $api } = useNuxtApp()

  async function detach(appSlug: string, databaseSlug: string): Promise<void> {
    await $api(
      `/v1/apps/${encodeURIComponent(appSlug)}/attachments/${encodeURIComponent(databaseSlug)}`,
      { method: 'DELETE' },
    )
  }

  return { detach }
}
