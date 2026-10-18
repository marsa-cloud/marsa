/**
 * `$fetch` serializes query values with `URLSearchParams`, which stringifies a nested object
 * to `[object Object]` — the cursor silently never reaches the API. The backend's `qs` parser
 * reads the bracket form, so the nesting has to be expressed in the key (#200 removes this).
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

// The api's pagination validator caps `limit` here.
const MAX_LIMIT = 100

export function useKeysetList<TItem, TKey>(
  path: string,
  parse: (raw: unknown) => { items: TItem[], meta: { next: TKey | null } },
  limit = 20,
  filters: Record<string, unknown> = {},
) {
  const { $api } = useNuxtApp()

  const items = ref<TItem[]>([]) as Ref<TItem[]>
  const next = ref<TKey | null>(null) as Ref<TKey | null>
  const pending = ref(false)
  const error = ref<unknown>(null)
  const exhausted = ref(false)

  // Bumped by every load, reset and refresh, so a response that lands after a reset can
  // tell it has been superseded. Without it, reset() returns empty while the request it
  // could not cancel pushes its page onto the cleared list — silently skipping page one.
  let generation = 0

  // Excludes `error`: a failed page must not auto-retry on scroll, but the button must.
  const canLoadMore = () => !pending.value && !exhausted.value && error.value === null

  async function fetchPage(pageLimit: number, key: TKey | null) {
    return parse(
      await $api(path, {
        query: {
          ...filters,
          ...bracketQuery('pagination', { limit: pageLimit, ...(key ? { key } : {}) }),
        },
      }),
    )
  }

  async function loadMore(): Promise<void> {
    if (pending.value || exhausted.value) return

    const attempt = ++generation
    pending.value = true
    error.value = null
    try {
      const page = await fetchPage(limit, next.value)

      if (attempt !== generation) return

      if (page.items.length === 0) {
        exhausted.value = true
        return
      }
      items.value.push(...page.items)
      next.value = page.meta.next
      // A short page cannot be followed by a full one, so stop without spending a request
      // to discover the empty page. A null cursor stops too: this API only nulls it on an
      // empty page, but the composable must not loop if that convention changes (#200).
      if (page.items.length < limit || page.meta.next === null) exhausted.value = true
    } catch (caught) {
      if (attempt === generation) error.value = caught
    } finally {
      if (attempt === generation) pending.value = false
    }
  }

  async function reset(): Promise<void> {
    generation++
    items.value = []
    next.value = null
    error.value = null
    exhausted.value = false
    // The superseded request no longer owns `pending`, so releasing it here is what lets
    // the fresh first-page load start instead of bailing at the guard above.
    pending.value = false
    await loadMore()
  }

  // Re-reads the loaded window in one request and swaps it in on arrival, so a poll neither
  // flashes an empty list nor drops the pages infinite scroll already loaded.
  async function refresh(): Promise<void> {
    // A page load in flight will show fresh rows anyway; superseding it would discard them.
    if (pending.value) return

    const attempt = ++generation
    const windowLimit = Math.min(
      MAX_LIMIT,
      Math.max(limit, Math.ceil(items.value.length / limit) * limit),
    )
    try {
      const page = await fetchPage(windowLimit, null)
      if (attempt !== generation) return

      items.value = page.items
      next.value = page.meta.next
      error.value = null
      exhausted.value = page.items.length < windowLimit || page.meta.next === null
    } catch (caught) {
      // Rows already on screen stay; only an empty list has nothing better to show than the error.
      if (attempt === generation && !items.value.length) error.value = caught
    }
  }

  return { items, next, pending, error, exhausted, canLoadMore, loadMore, reset, refresh }
}
