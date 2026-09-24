import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import GithubRepoPicker from '../GithubRepoPicker.vue'

const s = vi.hoisted(() => ({
  data: null as unknown,
  status: 'success',
  error: null as unknown,
}))

mockNuxtImport('useRepositoryList', () => () => ({
  data: ref(s.data),
  status: ref(s.status),
  error: ref(s.error),
}))

const repo = {
  installationUuid: 'i1',
  fullName: 'acme/shop',
  defaultBranch: 'main',
  private: true,
}

beforeEach(() => {
  s.data = { items: [repo] }
  s.status = 'success'
  s.error = null
})

describe('GithubRepoPicker', () => {
  it('offers the repositories in a select', async () => {
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: undefined } })

    expect(wrapper.find('[data-testid="repo-select"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Connect GitHub')
  })

  it('shows the chosen repository', async () => {
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: repo } })

    expect(wrapper.text()).toContain('acme/shop')
  })

  it('points to the GitHub setup when no installation can see a repo', async () => {
    s.data = { items: [] }
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: undefined } })

    expect(wrapper.text()).toContain('Connect GitHub')
    expect(wrapper.find('a[href="/setup/github"]').exists()).toBe(true)
  })

  it('says so when the repositories cannot be loaded', async () => {
    s.error = new Error('502')
    const wrapper = await mountSuspended(GithubRepoPicker, { props: { modelValue: undefined } })

    expect(wrapper.text()).toContain('Couldn\'t load your GitHub repositories')
  })
})
