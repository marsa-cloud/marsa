<script setup lang="ts">
// useProjectEnvironmentPicker / useToast / extractApiError are auto-imports, left un-imported so
// tests can mock them via mockNuxtImport.

const environmentUuid = defineModel<string | undefined>({ required: true })

const {
  projects,
  environments,
  environmentsError,
  projectSlug,
  loadProjects,
  createProject,
  createEnvironment,
  deleteProject,
  deleteEnvironment,
} = useProjectEnvironmentPicker(environmentUuid)
const toast = useToast()

type Kind = 'project' | 'environment'

function fail(title: string, err: unknown) {
  toast.add({
    title,
    description: extractApiError(err),
    color: 'error',
    icon: 'i-lucide-triangle-alert',
  })
}

onMounted(() => loadProjects().catch(err => fail('Couldn\'t load projects', err)))
watch(environmentsError, (err) => {
  if (err) fail('Couldn\'t load environments', err)
})

const creating = ref<Kind | null>(null)
const draft = reactive({ name: '', slug: '' })
const createError = ref<string | null>(null)
const saving = ref(false)

function openCreate(kind: Kind) {
  creating.value = kind
  draft.name = ''
  draft.slug = ''
  createError.value = null
}

async function submitCreate() {
  saving.value = true
  createError.value = null
  try {
    if (creating.value === 'project') await createProject(draft.name, draft.slug)
    else await createEnvironment(draft.name, draft.slug)
    creating.value = null
  } catch (err) {
    createError.value = extractApiError(err)
  } finally {
    saving.value = false
  }
}

const deleting = ref<{ kind: Kind, slug: string } | null>(null)

async function confirmDelete() {
  const target = deleting.value
  if (!target) return
  deleting.value = null
  try {
    if (target.kind === 'project') await deleteProject(target.slug)
    else await deleteEnvironment(target.slug)
  } catch (err) {
    fail(`Couldn't delete ${target.slug}`, err)
  }
}
</script>

<template>
  <div class="space-y-4">
    <UFormField
      label="Project"
      name="project"
      required
    >
      <div class="flex gap-2">
        <USelectMenu
          v-model="projectSlug"
          :items="projects"
          value-key="slug"
          label-key="name"
          placeholder="Choose a project"
          class="flex-1"
        >
          <template #item-trailing="{ item }">
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              :aria-label="`Delete project ${item.slug}`"
              @pointerdown.stop
              @click.stop="deleting = { kind: 'project', slug: item.slug }"
            />
          </template>
        </USelectMenu>
        <UButton
          icon="i-lucide-plus"
          variant="subtle"
          color="neutral"
          aria-label="New project"
          @click="openCreate('project')"
        />
      </div>
    </UFormField>

    <UFormField
      label="Environment"
      name="environmentUuid"
      description="Each environment is isolated from the others"
      required
    >
      <div class="flex gap-2">
        <USelectMenu
          v-model="environmentUuid"
          :items="environments"
          value-key="uuid"
          label-key="name"
          :disabled="!projectSlug"
          placeholder="Choose an environment"
          class="flex-1"
        >
          <template #item-trailing="{ item }">
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              :aria-label="`Delete environment ${item.slug}`"
              @pointerdown.stop
              @click.stop="deleting = { kind: 'environment', slug: item.slug }"
            />
          </template>
        </USelectMenu>
        <UButton
          icon="i-lucide-plus"
          variant="subtle"
          color="neutral"
          aria-label="New environment"
          :disabled="!projectSlug"
          @click="openCreate('environment')"
        />
      </div>
    </UFormField>

    <UModal
      :open="creating !== null"
      :title="creating === 'project' ? 'New project' : 'New environment'"
      @update:open="
        (open) => {
          if (!open) creating = null
        }
      "
    >
      <template #body>
        <div class="space-y-3">
          <UAlert
            v-if="createError"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="createError"
          />
          <UFormField label="Name">
            <UInput
              id="picker-name"
              v-model="draft.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Slug"
            :description="creating === 'project' ? 'Up to 30 characters' : 'Up to 32 characters'"
          >
            <UInput
              id="picker-slug"
              v-model="draft.slug"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          label="Create"
          :loading="saving"
          @click="submitCreate"
        />
      </template>
    </UModal>

    <UModal
      :open="deleting !== null"
      :title="`Delete ${deleting?.kind} ${deleting?.slug}?`"
      description="Only possible while it is empty."
      @update:open="
        (open) => {
          if (!open) deleting = null
        }
      "
    >
      <template #footer>
        <UButton
          color="error"
          label="Delete"
          @click="confirmDelete"
        />
      </template>
    </UModal>
  </div>
</template>
