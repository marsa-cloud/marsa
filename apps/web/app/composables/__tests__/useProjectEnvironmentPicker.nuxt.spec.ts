import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useProjectEnvironmentPicker } from '../useProjectEnvironmentPicker'

const listProjects = vi.hoisted(() => vi.fn())
const listEnvironments = vi.hoisted(() => vi.fn())
const createProject = vi.hoisted(() => vi.fn())
const createEnvironment = vi.hoisted(() => vi.fn())
const removeProject = vi.hoisted(() => vi.fn())
const removeEnvironment = vi.hoisted(() => vi.fn())

mockNuxtImport('useProjectList', () => () => ({ list: listProjects }))
mockNuxtImport('useEnvironmentList', () => () => ({ list: listEnvironments }))
mockNuxtImport('useCreateProject', () => () => ({ create: createProject }))
mockNuxtImport('useCreateEnvironment', () => () => ({ create: createEnvironment }))
mockNuxtImport('useDeleteProject', () => () => ({ remove: removeProject }))
mockNuxtImport('useDeleteEnvironment', () => () => ({ remove: removeEnvironment }))

const demo = { uuid: 'p1', name: 'Demo', slug: 'demo', createdAt: '2026-09-19T00:00:00.000Z' }
const dev = {
  uuid: 'e1',
  name: 'Dev',
  slug: 'dev',
  namespace: 'demo-dev',
  createdAt: '2026-09-19T00:00:00.000Z',
}
const flush = () => new Promise(resolve => setTimeout(resolve))

beforeEach(() => {
  listProjects.mockReset().mockResolvedValue([demo])
  listEnvironments.mockReset().mockResolvedValue([dev])
  createProject.mockReset()
  createEnvironment.mockReset()
  removeProject.mockReset().mockResolvedValue(undefined)
  removeEnvironment.mockReset().mockResolvedValue(undefined)
})

describe('useProjectEnvironmentPicker', () => {
  it('loads environments for the chosen project and clears a stale environment', async () => {
    const selected = ref<string | undefined>('stale')
    const picker = useProjectEnvironmentPicker(selected)
    await picker.loadProjects()

    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()

    expect(listEnvironments).toHaveBeenCalledWith('demo')
    expect(picker.environments.value).toEqual([dev])
    expect(selected.value).toBeUndefined()
  })

  it('creates a project and selects it', async () => {
    createProject.mockResolvedValue({ uuid: 'p2', name: 'New', slug: 'new' })
    const picker = useProjectEnvironmentPicker(ref())

    await picker.createProject('New', 'new')

    expect(createProject).toHaveBeenCalledWith({ name: 'New', slug: 'new' })
    expect(listProjects).toHaveBeenCalled()
    expect(picker.projectSlug.value).toBe('new')
  })

  it('creates an environment in the chosen project and selects it', async () => {
    createEnvironment.mockResolvedValue({ ...dev, projectSlug: 'demo' })
    const selected = ref<string | undefined>()
    const picker = useProjectEnvironmentPicker(selected)
    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()

    await picker.createEnvironment('Dev', 'dev')

    expect(createEnvironment).toHaveBeenCalledWith('demo', { name: 'Dev', slug: 'dev' })
    expect(selected.value).toBe('e1')
  })

  it('clears the selection when the selected environment is deleted', async () => {
    const selected = ref<string | undefined>()
    const picker = useProjectEnvironmentPicker(selected)
    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()
    selected.value = 'e1'

    await picker.deleteEnvironment('dev')

    expect(removeEnvironment).toHaveBeenCalledWith('demo', 'dev')
    expect(selected.value).toBeUndefined()
  })

  it('clears the project when the selected project is deleted', async () => {
    const picker = useProjectEnvironmentPicker(ref())
    picker.projectSlug.value = 'demo'

    await picker.deleteProject('demo')

    expect(removeProject).toHaveBeenCalledWith('demo')
    expect(picker.projectSlug.value).toBeUndefined()
  })

  it('surfaces a refused delete to the caller', async () => {
    removeProject.mockRejectedValue({
      data: { statusCode: 409, message: 'still has environments' },
    })
    const picker = useProjectEnvironmentPicker(ref())

    await expect(picker.deleteProject('demo')).rejects.toBeDefined()
  })

  it('ignores a slow environment list for a project the user switched away from', async () => {
    let resolveSlow: (value: unknown) => void = () => {}
    const other = { ...dev, uuid: 'e2', slug: 'prod', namespace: 'other-prod' }
    listEnvironments.mockImplementation((slug: string) =>
      slug === 'demo' ? new Promise(resolve => (resolveSlow = resolve)) : Promise.resolve([other]),
    )
    const picker = useProjectEnvironmentPicker(ref())

    picker.projectSlug.value = 'demo'
    await nextTick()
    picker.projectSlug.value = 'other'
    await nextTick()
    await flush()
    resolveSlow([dev])
    await flush()

    expect(picker.environments.value).toEqual([other])
  })

  it('offers no stale environments when loading the new project fails', async () => {
    const picker = useProjectEnvironmentPicker(ref())
    picker.projectSlug.value = 'demo'
    await nextTick()
    await flush()
    expect(picker.environments.value).toEqual([dev])

    listEnvironments.mockRejectedValue(new Error('network down'))
    picker.projectSlug.value = 'other'
    await nextTick()
    await flush()

    expect(picker.environments.value).toEqual([])
    expect(picker.environmentsError.value).toBeInstanceOf(Error)
  })
})
