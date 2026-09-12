import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
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

  // The dropdown is a Nuxt UI menu, so the handler is driven through its event
  // rather than by clicking through the overlay.
  async function changeRole(wrapper: Awaited<ReturnType<typeof mountSuspended>>, role: string) {
    const menus = wrapper.findAllComponents({ name: 'USelectMenu' })
    await menus[1]!.vm.$emit('update:model-value', role)
    await flushPromises()
  }

  it('promotes a guest and reloads the list', async () => {
    const wrapper = await mountSuspended(Team)
    // The page loads its first page on mount; this asserts about the change, not that.
    refresh.mockClear()

    await changeRole(wrapper, 'member')

    expect(updateRole).toHaveBeenCalledWith('u-2', 'member')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'hubot is now member', color: 'success' }),
    )
  })

  it('tells the operator why a role change was refused', async () => {
    updateRole.mockRejectedValueOnce({ data: { message: 'Cannot demote the last operator.' } })
    const wrapper = await mountSuspended(Team)

    await changeRole(wrapper, 'member')

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        description: 'Cannot demote the last operator.',
      }),
    )
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('surfaces a load failure instead of an empty list', async () => {
    const loaded = state.users
    state.users = []
    state.error = new Error('boom')

    const wrapper = await mountSuspended(Team)

    expect(wrapper.text()).toContain('Could not load the team')
    state.users = loaded
    state.error = null
  })

  // Replacing the list would take the already-loaded members off screen along with the
  // footer's Retry button, leaving no way back.
  it('keeps the loaded members when a later page fails', async () => {
    state.error = new Error('boom')

    const wrapper = await mountSuspended(Team)

    expect(wrapper.text()).not.toContain('Could not load the team')
    expect(wrapper.text()).toContain('octocat')
    state.error = null
  })
})
