/**
 * Accumulating reader for a keyset-paginated index endpoint.
 *
 * Not `useAsyncData`: that is a keyed single-request cache which *replaces* its
 * payload on every fetch, so paging through it would discard the rows already
 * on screen. This keeps one growing `items` array instead.
 *
 * A page that comes back empty is how the API says "no more" — `next` is built
 * from the last row returned, so the final request of an exact multiple is an
 * empty one.
 */
/**
 * Flattens a nested query object into `parent[child]` keys.
 *
 * `$fetch` serializes query values with `URLSearchParams`, which stringifies a
 * nested object to `[object Object]` — the cursor silently never reaches the
 * API. The backend's `qs` parser reads the bracket form (percent-encoded
 * brackets included), so the nesting has to be expressed in the key.
 */
function bracketQuery(prefix: string, value: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || child === null) continue
    if (typeof child === 'object') {
      Object.assign(flat, bracketQuery(`${prefix}[${key}]`, child as Record<string, unknown>))
    } else {
      flat[`${prefix}[${key}]`] = child
    }
  }
  return flat
}

export function useKeysetList<TItem, TKey>(
  path: string,
  parse: (raw: unknown) => { items: TItem[], meta: { next: TKey | null } },
  limit = 20,
) {
  const { $api } = useNuxtApp()

  const items = ref<TItem[]>([]) as Ref<TItem[]>
  const next = ref<TKey | null>(null) as Ref<TKey | null>
  const pending = ref(false)
  const error = ref<unknown>(null)
  const exhausted = ref(false)

  const canLoadMore = () => !pending.value && !exhausted.value && error.value === null

  async function loadMore(): Promise<void> {
    if (!canLoadMore()) return

    pending.value = true
    try {
      const page = parse(
        await $api(path, {
          query: bracketQuery('pagination', {
            limit,
            ...(next.value ? { key: next.value } : {}),
          }),
        }),
      )

      if (page.items.length === 0) {
        exhausted.value = true
        return
      }
      items.value.push(...page.items)
      next.value = page.meta.next
      // A short page cannot be followed by a full one, so stop without spending
      // a request to discover the empty page.
      if (page.items.length < limit) exhausted.value = true
    } catch (caught) {
      error.value = caught
    } finally {
      pending.value = false
    }
  }

  async function reset(): Promise<void> {
    items.value = []
    next.value = null
    error.value = null
    exhausted.value = false
    await loadMore()
  }

  return { items, next, pending, error, exhausted, canLoadMore, loadMore, reset }
}
