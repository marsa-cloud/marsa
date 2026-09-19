import type { Ref } from 'vue'

import type { EnvironmentSummary, ProjectSummary } from '~/api/types.gen'

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

  async function loadProjects(): Promise<void> {
    projects.value = await listProjects()
  }

  async function loadEnvironments(): Promise<void> {
    environments.value = projectSlug.value ? await listEnvironments(projectSlug.value) : []
  }

  watch(projectSlug, async () => {
    environmentUuid.value = undefined
    await loadEnvironments()
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
    projectSlug,
    loadProjects,
    createProject,
    createEnvironment,
    deleteProject,
    deleteEnvironment,
  }
}
