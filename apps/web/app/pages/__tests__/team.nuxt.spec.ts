import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import Team from '../team.vue'

const state = vi.hoisted(() => ({
  users: [
    { uuid: 'u-1', githubUserId: '1', login: 'octocat', role: 'operator', createdAt: '2026-01-01T00:00:00.000Z' },
    { uuid: 'u-2', githubUserId: '2', login: 'hubot', role: 'guest', createdAt: '2026-01-02T00:00:00.000Z' },
  ],
  status: 'success',
  error: null as unknown,
}))
const updateRole = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const refresh = vi.hoisted(() => vi.fn())
const toastAdd = vi.hoisted(() => vi.fn())

mockNuxtImport('useUserList', () => () => ({
  items: ref(state.users),
  pending: ref(false),
  error: ref(state.error),
  exhausted: ref(true),
  canLoadMore: () => false,
  loadMore: vi.fn(),
  reset: refresh,
}))
mockNuxtImport('useUpdateUserRole', () => () => ({ updateRole }))
mockNuxtImport('useCurrentUser', () => () => ({
  data: ref({ id: '1', login: 'octocat', role: 'operator' }),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  updateRole.mockClear()
  refresh.mockClear()
  toastAdd.mockClear()
})

describe('team page', () => {
  it('lists every user with their GitHub id', async () => {
    const wrapper = await mountSuspended(Team)

    expect(wrapper.text()).toContain('octocat')
    expect(wrapper.text()).toContain('hubot')
    expect(wrapper.text()).toContain('GitHub id 2')
  })

  it('surfaces a load failure instead of an empty list', async () => {
    state.error = new Error('boom')

    const wrapper = await mountSuspended(Team)

    expect(wrapper.text()).toContain('Could not load the team')
    state.error = null
  })
})
