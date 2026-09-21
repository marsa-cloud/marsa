import type { Ref } from 'vue'

import type { EnvironmentSummary, ProjectSummary } from '~/api/types.gen'

/**
 * State and actions behind `ProjectEnvironmentPicker.vue` (#142): two dependent lists, the
 * selected project, and create/delete for both. Extracted from the component so the watcher's
 * ordering guarantees — clear before loading, discard a response for a project the user already
 * left — are unit-testable without mounting.
 */
export function useProjectEnvironmentPicker(environmentUuid: Ref<string | undefined>) {
  const { list: listProjects } = useProjectList()
  const { list: listEnvironments } = useEnvironmentList()
  const { create: postProject } = useCreateProject()
  const { create: postEnvironment } = useCreateEnvironment()
  const { remove: removeProject } = useDeleteProject()
  const { remove: removeEnvironment } = useDeleteEnvironment()

  const projects = ref<ProjectSummary[]>([])
  const environments = ref<EnvironmentSummary[]>([])
  const projectSlug = ref<string | undefined>()
  const environmentsError = ref<unknown>(null)

  async function loadProjects(): Promise<void> {
    projects.value = await listProjects()
  }

  async function loadEnvironments(): Promise<void> {
    const slug = projectSlug.value
    const loaded = slug ? await listEnvironments(slug) : []
    // A slower response for a project the user already switched away from must not win.
    if (projectSlug.value === slug) environments.value = loaded
  }

  // Cleared first so a failed load can never leave the previous project's environments selectable.
  watch(projectSlug, async () => {
    environmentUuid.value = undefined
    environments.value = []
    environmentsError.value = null
    try {
      await loadEnvironments()
    } catch (err) {
      environmentsError.value = err
    }
  })

  async function createProject(name: string, slug: string): Promise<void> {
    const project = await postProject({ name, slug })
    await loadProjects()
    projectSlug.value = project.slug
  }

  async function createEnvironment(name: string, slug: string): Promise<void> {
    if (!projectSlug.value) return
    const environment = await postEnvironment(projectSlug.value, { name, slug })
    await loadEnvironments()
    environmentUuid.value = environment.uuid
  }

  async function deleteProject(slug: string): Promise<void> {
    await removeProject(slug)
    if (projectSlug.value === slug) projectSlug.value = undefined
    await loadProjects()
  }

  async function deleteEnvironment(slug: string): Promise<void> {
    if (!projectSlug.value) return
    const deleted = environments.value.find(environment => environment.slug === slug)
    await removeEnvironment(projectSlug.value, slug)
    if (deleted && environmentUuid.value === deleted.uuid) environmentUuid.value = undefined
    await loadEnvironments()
  }

  return {
    projects,
    environments,
    environmentsError,
    projectSlug,
    loadProjects,
    createProject,
    createEnvironment,
    deleteProject,
    deleteEnvironment,
  }
}
