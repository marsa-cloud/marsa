import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useKeysetList } from '../useKeysetList'

interface Row { uuid: string }

const PAGE_SIZE = 2
const rows: Row[] = [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }, { uuid: 'd' }]

const seenQueries: unknown[] = []
let failNext = false

registerEndpoint('/api/v1/things', (event) => {
  const query = getQuery(event)
  seenQueries.push(query)
  if (failNext) throw new Error('boom')

  // h3 does not bracket-parse; the real API (Fastify + qs) does. Read the key
  // exactly as the composable serializes it.
  const after = (query as Record<string, string | undefined>)['pagination[key][uuid]']
  const start = after ? rows.findIndex(row => row.uuid === after) + 1 : 0
  const items = rows.slice(start, start + PAGE_SIZE)
  return { items, meta: { next: items.at(-1) ?? null } }
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
  seenQueries.length = 0
  failNext = false
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

  it('clears accumulated rows on reset', async () => {
    const list = await mountList()

    await list.reset()
    await list.loadMore()
    await list.reset()

    expect(list.items.value.map(row => row.uuid)).toEqual(['a', 'b'])
  })
})
