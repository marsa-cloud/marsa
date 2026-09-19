import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import ProjectEnvironmentPicker from '../ProjectEnvironmentPicker.vue'

const picker = vi.hoisted(() => ({ value: null as unknown }))
const toastAdd = vi.hoisted(() => vi.fn())
mockNuxtImport('useProjectEnvironmentPicker', () => () => picker.value)
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

function stubPicker(projectSlug?: string) {
  const state = {
    projects: ref([{ uuid: 'p1', name: 'Demo', slug: 'demo', createdAt: '' }]),
    environments: ref([]),
    projectSlug: ref(projectSlug),
    loadProjects: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue(undefined),
    createEnvironment: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    deleteEnvironment: vi.fn().mockResolvedValue(undefined),
  }
  picker.value = state
  return state
}

const mount = () =>
  mountSuspended(ProjectEnvironmentPicker, {
    props: { modelValue: undefined },
    attachTo: document.body,
  })

function type(selector: string, value: string) {
  const input = document.querySelector(selector) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function clickButton(label: string) {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  button!.click()
}

beforeEach(() => {
  toastAdd.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ProjectEnvironmentPicker', () => {
  it('loads projects on mount and renders both fields', async () => {
    const state = stubPicker()
    const wrapper = await mount()

    expect(state.loadProjects).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Project')
    expect(wrapper.text()).toContain('Environment')
  })

  it('keeps the environment controls disabled until a project is chosen', async () => {
    stubPicker()
    const wrapper = await mount()

    expect(wrapper.find('[aria-label="New environment"]').attributes('disabled')).toBeDefined()
  })

  it('enables the environment controls once a project is chosen', async () => {
    stubPicker('demo')
    const wrapper = await mount()

    expect(wrapper.find('[aria-label="New environment"]').attributes('disabled')).toBeUndefined()
  })

  it('creates a project from the modal', async () => {
    const state = stubPicker()
    const wrapper = await mount()

    await wrapper.find('[aria-label="New project"]').trigger('click')
    await nextTick()
    type('#picker-name', 'New')
    type('#picker-slug', 'new')
    await nextTick()
    clickButton('Create')
    await flushPromises()

    expect(state.createProject).toHaveBeenCalledWith('New', 'new')
    expect(document.querySelector('#picker-name')).toBeNull()
  })

  it('creates an environment in the chosen project', async () => {
    const state = stubPicker('demo')
    const wrapper = await mount()

    await wrapper.find('[aria-label="New environment"]').trigger('click')
    await nextTick()
    type('#picker-name', 'Dev')
    type('#picker-slug', 'dev')
    await nextTick()
    clickButton('Create')
    await flushPromises()

    expect(state.createEnvironment).toHaveBeenCalledWith('Dev', 'dev')
  })

  it('keeps the modal open with the API message when creating fails', async () => {
    const state = stubPicker()
    state.createProject.mockRejectedValue({ data: { message: 'A project with slug \'new\' already exists.' } })
    const wrapper = await mount()

    await wrapper.find('[aria-label="New project"]').trigger('click')
    await nextTick()
    clickButton('Create')
    await flushPromises()

    expect(document.body.textContent).toContain('A project with slug \'new\' already exists.')
    expect(document.querySelector('#picker-name')).not.toBeNull()
  })

  it('deletes a project from its trash icon without selecting it', async () => {
    const state = stubPicker()
    const wrapper = await mount()

    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[aria-label="Delete project demo"]') as HTMLButtonElement).click()
    await flushPromises()
    clickButton('Delete')
    await flushPromises()

    expect(state.deleteProject).toHaveBeenCalledWith('demo')
    expect(state.projectSlug.value).toBeUndefined()
  })

  it('toasts the refusal when a delete is rejected', async () => {
    const state = stubPicker()
    state.deleteProject.mockRejectedValue({ data: { message: 'Project \'demo\' still has environments.' } })
    const wrapper = await mount()

    await wrapper.find('button[aria-haspopup="listbox"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[aria-label="Delete project demo"]') as HTMLButtonElement).click()
    await flushPromises()
    clickButton('Delete')
    await flushPromises()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Couldn\'t delete demo',
        description: 'Project \'demo\' still has environments.',
        color: 'error',
      }),
    )
  })
})
