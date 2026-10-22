import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useKeysetList } from '../useKeysetList'

interface Row { uuid: string }

const PAGE_SIZE = 2
const ROWS: Row[] = [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }, { uuid: 'd' }]
let rows: Row[] = [...ROWS]

const seenQueries: unknown[] = []
let failNext = false
let delayMs = 0
let nullNext = false

registerEndpoint('/api/v1/things', async (event) => {
  const query = getQuery(event)
  seenQueries.push(query)
  if (failNext) throw new Error('boom')
  if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))

  // h3 does not bracket-parse; the real API (Fastify + qs) does. Read the key
  // exactly as the composable serializes it.
  const after = (query as Record<string, string | undefined>)['pagination[key][uuid]']
  const start = after ? rows.findIndex(row => row.uuid === after) + 1 : 0
  const limit = Number((query as Record<string, string | undefined>)['pagination[limit]'])
  const items = rows.slice(start, start + limit)
  return { items, meta: { next: nullNext ? null : (items.at(-1) ?? null) } }
})

function mountList() {
  let result!: ReturnType<typeof useKeysetList<Row, Row>>
  return mountSuspended(
    defineComponent({
      setup() {
        result = useKeysetList<Row, Row>(
          '/v1/things',
          raw => raw as { items: Row[], meta: { next: Row | null } },
          PAGE_SIZE,
        )
        return () => h('div')
      },
    }),
  ).then(() => result)
}

beforeEach(() => {
  rows = [...ROWS]
  seenQueries.length = 0
  failNext = false
  delayMs = 0
  nullNext = false
})

describe('useKeysetList', () => {
  it('accumulates pages instead of replacing them', async () => {
    const list = await mountList()

    await list.reset()
    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b'])

    await list.loadMore()
    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sends the previous page cursor on the next request', async () => {
    const list = await mountList()

    await list.reset()
    await list.loadMore()

    // Bracketed keys, not a nested object: $fetch would stringify a nested one
    // to "[object Object]" and the cursor would never arrive.
    expect(seenQueries[1]).toMatchObject({ 'pagination[key][uuid]': 'b' })
  })

  it('walks every row exactly once', async () => {
    const list = await mountList()

    await list.reset()
    while (list.canLoadMore()) await list.loadMore()

    const uuids = list.items.value.map(row => row.uuid)
    expect(uuids).toEqual(['a', 'b', 'c', 'd'])
    expect(new Set(uuids).size).toBe(uuids.length)
  })

  it('stops on the empty page and reports itself exhausted', async () => {
    const list = await mountList()

    await list.reset()
    await list.loadMore()
    await list.loadMore()

    expect(list.exhausted.value).toBe(true)
    expect(list.canLoadMore()).toBe(false)
  })

  it('does not keep requesting once exhausted', async () => {
    const list = await mountList()

    await list.reset()
    while (list.canLoadMore()) await list.loadMore()
    const settled = seenQueries.length

    await list.loadMore()

    expect(seenQueries.length).toBe(settled)
  })

  it('surfaces a failure and stops rather than looping on it', async () => {
    const list = await mountList()
    failNext = true

    await list.reset()

    expect(list.error.value).toBeTruthy()
    expect(list.canLoadMore()).toBe(false)
  })

  it('retries after a failure instead of latching shut', async () => {
    const list = await mountList()
    failNext = true

    await list.reset()
    expect(list.error.value).toBeTruthy()
    expect(list.canLoadMore()).toBe(false)

    failNext = false
    await list.loadMore()

    expect(list.error.value).toBeNull()
    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b'])
    expect(list.canLoadMore()).toBe(true)
  })

  // The API only nulls the cursor on an empty page, so a full page with a null `next`
  // cannot happen today — the guard exists so the composable cannot loop if it ever does.
  it('stops on a null cursor even when the page is full', async () => {
    nullNext = true
    const list = await mountList()

    await list.reset()

    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b'])
    expect(list.exhausted.value).toBe(true)
    expect(list.canLoadMore()).toBe(false)
  })

  it('discards a page that lands after a reset instead of grafting it onto the cleared list', async () => {
    const list = await mountList()
    await list.reset()

    delayMs = 30
    const superseded = list.loadMore()
    await list.reset()
    await superseded

    // Without the generation guard the stale page two lands on the emptied array, so the
    // list shows ['c','d'] with the cursor past them and page one silently skipped.
    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b'])
    expect(list.next.value).toEqual({ uuid: 'b' })
  })

  it('clears accumulated rows on reset', async () => {
    const list = await mountList()

    await list.reset()
    await list.loadMore()
    await list.reset()

    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b'])
  })

  describe('refresh', () => {
    const uuids = (list: Awaited<ReturnType<typeof mountList>>) =>
      list.items.value.map(row => row.uuid)

    it('swaps the fresh first page in without emptying the list first', async () => {
      const list = await mountList()
      await list.reset()

      rows = [{ uuid: 'z' }, ...ROWS]
      delayMs = 30
      const refreshing = list.refresh()
      expect(uuids(list)).toEqual(['a', 'b'])
      expect(list.pending.value).toBe(false)
      await refreshing

      expect(uuids(list)).toEqual(['z', 'a'])
      expect(list.next.value).toEqual({ uuid: 'a' })
    })

    it('re-reads every loaded page in one request so infinite scroll keeps its rows', async () => {
      const list = await mountList()
      await list.reset()
      await list.loadMore()

      rows = [{ uuid: 'z' }, ...ROWS]
      await list.refresh()

      expect(seenQueries.at(-1)).toMatchObject({ 'pagination[limit]': '4' })
      expect(seenQueries.at(-1)).not.toHaveProperty('pagination[key][uuid]')
      expect(uuids(list)).toEqual(['z', 'a', 'b', 'c'])
      expect(list.exhausted.value).toBe(false)

      await list.loadMore()
      expect(uuids(list)).toEqual(['z', 'a', 'b', 'c', 'd'])
    })

    it('marks the list exhausted when the window comes back short', async () => {
      const list = await mountList()
      await list.reset()

      rows = [{ uuid: 'a' }]
      await list.refresh()

      expect(uuids(list)).toEqual(['a'])
      expect(list.exhausted.value).toBe(true)
    })

    it('loses to a reset that starts while it is in flight', async () => {
      const list = await mountList()
      await list.reset()
      await list.loadMore()

      delayMs = 30
      const refreshing = list.refresh()
      delayMs = 0
      await list.reset()
      await refreshing

      expect(uuids(list)).toEqual(['a', 'b'])
      expect(list.next.value).toEqual({ uuid: 'b' })
    })

    it('skips while a page load is in flight', async () => {
      const list = await mountList()
      await list.reset()

      delayMs = 30
      const loading = list.loadMore()
      const sent = seenQueries.length
      await list.refresh()
      await loading

      expect(seenQueries.length).toBe(sent)
      expect(uuids(list)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('keeps the rows on screen when it fails', async () => {
      const list = await mountList()
      await list.reset()

      failNext = true
      await list.refresh()

      expect(uuids(list)).toEqual(['a', 'b'])
      expect(list.error.value).toBeNull()
    })

    it('surfaces the failure when there is nothing on screen', async () => {
      const list = await mountList()

      failNext = true
      await list.refresh()

      expect(list.error.value).toBeTruthy()
    })
  })
})
