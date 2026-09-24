<script setup lang="ts">
import * as z from 'zod'

import type { CreateAppCommand, CreateAppResponse, GitHubRepositorySummary, NodePin } from '~/api/types.gen'
import { appConfigFields, isReplicaRangeValid, REPLICA_RANGE_ERROR } from '~/utils/appConfigSchema'
import { repoSlug } from '~/utils/repoSlug'

// useCreateApp / useShipRelease / buildEnvRecord / extractApiError are Nuxt auto-imports,
// left un-imported so tests can mock them via mockNuxtImport.

useSeoMeta({ title: 'Deploy an app — Marsa' })

const { create } = useCreateApp()
const { ship } = useShipRelease()
const toast = useToast()

type Mode = 'github' | 'image'
const mode = ref<Mode>('github')

const sharedFields = {
  environmentUuid: z.string({ error: 'Pick an environment' }).min(1, 'Pick an environment'),
  slug: z
    .string()
    .min(1, 'Required')
    .max(63, 'Max 63 characters')
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
  minReplicas: appConfigFields.minReplicas,
  maxReplicas: appConfigFields.maxReplicas,
}

const imageSchema = z
  .object({ ...sharedFields, image: appConfigFields.image, containerPort: appConfigFields.containerPort })
  .refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)

const githubSchema = z
  .object({
    ...sharedFields,
    repo: z.custom<GitHubRepositorySummary>(value => !!value, 'Pick a repository'),
    branch: z.string().min(1, 'Required'),
    rootDir: z.string().min(1, 'Required'),
    dockerfilePath: z.string().min(1, 'Required'),
    containerPort: appConfigFields.containerPort.optional(),
  })
  .refine(isReplicaRangeValid, REPLICA_RANGE_ERROR)

const schema = computed(() => (mode.value === 'github' ? githubSchema : imageSchema))

const state = reactive<{
  environmentUuid: string | undefined
  slug: string
  repo: GitHubRepositorySummary | undefined
  branch: string
  rootDir: string
  dockerfilePath: string
  image: string
  containerPort: number | undefined
  minReplicas: number | undefined
  maxReplicas: number | undefined
  nodePin: NodePin | null
}>({
  environmentUuid: undefined,
  slug: '',
  repo: undefined,
  branch: '',
  rootDir: '.',
  dockerfilePath: 'Dockerfile',
  image: '',
  containerPort: undefined,
  minReplicas: undefined,
  maxReplicas: undefined,
  nodePin: null,
})

watch(
  () => state.repo,
  (repo) => {
    if (!repo) return
    state.branch = repo.defaultBranch
    if (!state.slug) state.slug = repoSlug(repo.fullName)
  },
)

function toggleMode() {
  mode.value = mode.value === 'github' ? 'image' : 'github'
}

// Stable per-row id so :key survives removals.
let nextEnvId = 0
function makeEnvRow() {
  return { id: nextEnvId++, key: '', value: '' }
}

const envRows = ref<{ id: number, key: string, value: string }[]>([makeEnvRow()])

function addEnvRow() {
  envRows.value.push(makeEnvRow())
}

function removeEnvRow(index: number) {
  envRows.value.splice(index, 1)
  if (envRows.value.length === 0) addEnvRow()
}

const submitting = ref(false)
const error = ref<string | null>(null)

function toCommand(environmentUuid: string): CreateAppCommand {
  const env = buildEnvRecord(envRows.value)
  const shared = {
    environmentUuid,
    slug: state.slug,
    ...(state.containerPort !== undefined ? { containerPort: state.containerPort } : {}),
    ...(state.minReplicas !== undefined ? { minReplicas: state.minReplicas } : {}),
    ...(state.maxReplicas !== undefined ? { maxReplicas: state.maxReplicas } : {}),
    ...(state.nodePin ? { nodePin: state.nodePin } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  }
  if (mode.value === 'image' || !state.repo) {
    return { ...shared, image: state.image }
  }
  return {
    ...shared,
    source: {
      installationUuid: state.repo.installationUuid,
      repo: state.repo.fullName,
      branch: state.branch,
      rootDir: state.rootDir,
      dockerfilePath: state.dockerfilePath,
    },
  }
}

// UForm only emits submit once the active schema passes, so state is valid here.
async function onSubmit() {
  if (!state.environmentUuid) return
  error.value = null
  submitting.value = true

  let created: CreateAppResponse
  try {
    created = await create(toCommand(state.environmentUuid))
  } catch (err) {
    error.value = extractApiError(err)
    submitting.value = false
    return
  }

  if (mode.value === 'github') {
    toast.add({
      title: 'Build started',
      description: `${created.slug} is building from ${state.repo?.fullName}@${state.branch}. It deploys when the build succeeds.`,
      color: 'success',
      icon: 'i-lucide-hammer',
    })
    submitting.value = false
    await navigateTo(`/apps/${created.slug}`)
    return
  }

  // The app exists now, so a failed deploy still belongs on its page, where Deploy retries it.
  try {
    await ship(created.slug)
    toast.add({
      title: 'Deploy started',
      description: `${created.slug} is rolling out at ${created.url}`,
      color: 'success',
      icon: 'i-lucide-check',
    })
  } catch (err) {
    toast.add({
      title: 'App created, but the deploy failed',
      description: extractApiError(err),
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    })
  } finally {
    submitting.value = false
  }
  await navigateTo(`/apps/${created.slug}`)
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="mode === 'github' ? 'Deploy from GitHub' : 'Deploy an image'">
        <template #leading>
          <UButton
            to="/apps"
            icon="i-lucide-arrow-left"
            variant="ghost"
            color="neutral"
            aria-label="Back to apps"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl">
        <!-- aria-live so screen readers announce a failed deploy even when the
             submit button is scrolled away from the alert. A successful deploy
             navigates away and is announced by the toast instead. -->
        <div aria-live="polite">
          <UAlert
            v-if="error"
            color="error"
            icon="i-lucide-triangle-alert"
            :title="error"
            class="mb-6"
          />
        </div>

        <div class="mb-4 flex justify-end">
          <UButton
            data-testid="toggle-image-mode"
            variant="link"
            color="neutral"
            size="sm"
            :icon="mode === 'github' ? 'i-lucide-box' : 'i-lucide-github'"
            :label="mode === 'github' ? 'Deploy a prebuilt image instead' : 'Deploy from GitHub instead'"
            @click="toggleMode"
          />
        </div>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit()"
        >
          <template v-if="mode === 'github'">
            <UFormField
              label="Repository"
              name="repo"
              required
            >
              <GithubRepoPicker v-model="state.repo" />
            </UFormField>

            <UFormField
              label="Branch"
              name="branch"
              description="Every push to this branch builds and deploys"
              required
            >
              <UInput
                id="branch"
                v-model="state.branch"
                placeholder="main"
                class="w-full"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Root directory"
                name="rootDir"
                description="Build context inside the repo"
              >
                <UInput
                  id="rootDir"
                  v-model="state.rootDir"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Dockerfile"
                name="dockerfilePath"
                description="Relative to the root directory"
              >
                <UInput
                  id="dockerfilePath"
                  v-model="state.dockerfilePath"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>

          <ProjectEnvironmentPicker v-model="state.environmentUuid" />

          <UFormField
            label="Slug"
            name="slug"
            description="Public subdomain label — becomes https://<slug>.<base>"
            required
          >
            <UInput
              id="slug"
              v-model="state.slug"
              placeholder="my-app"
              class="w-full"
            />
          </UFormField>

          <template v-if="mode === 'image'">
            <UFormField
              label="Image"
              name="image"
              description="Fully-qualified container image reference"
              required
            >
              <UInput
                id="image"
                v-model="state.image"
                placeholder="nginx:1.27"
                class="w-full"
              />
            </UFormField>
          </template>

          <UFormField
            label="Container port"
            name="containerPort"
            :description="
              mode === 'github'
                ? 'Your app reads it from $PORT. Defaults to 8080'
                : 'Port the container listens on'
            "
            :required="mode === 'image'"
          >
            <UInputNumber
              id="containerPort"
              v-model="state.containerPort"
              :min="1"
              :max="65535"
              :placeholder="mode === 'github' ? '8080' : '80'"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Minimum replicas"
            name="minReplicas"
            description="0 lets the app sleep when idle and wake on the first request"
          >
            <UInputNumber
              id="minReplicas"
              v-model="state.minReplicas"
              :min="0"
              :max="100"
              placeholder="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Maximum replicas"
            name="maxReplicas"
            description="Defaults to 1"
          >
            <UInputNumber
              id="maxReplicas"
              v-model="state.maxReplicas"
              :min="1"
              :max="100"
              placeholder="1"
              class="w-full"
            />
          </UFormField>

          <NodePinPicker
            v-model="state.nodePin"
            :max-replicas="state.maxReplicas"
          />

          <UFormField
            label="Environment variables"
            description="Plain (non-secret) variables passed to the container"
          >
            <div class="space-y-2">
              <div
                v-for="(row, index) in envRows"
                :key="row.id"
                class="flex items-center gap-2"
              >
                <UInput
                  v-model="row.key"
                  placeholder="KEY"
                  class="flex-1"
                  :aria-label="`env key ${index + 1}`"
                />
                <UInput
                  v-model="row.value"
                  placeholder="value"
                  class="flex-1"
                  :aria-label="`env value ${index + 1}`"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  color="neutral"
                  :aria-label="`Remove environment variable ${index + 1}`"
                  @click="removeEnvRow(index)"
                />
              </div>
              <UButton
                icon="i-lucide-plus"
                variant="ghost"
                size="sm"
                label="Add variable"
                @click="addEnvRow"
              />
            </div>
          </UFormField>

          <UButton
            type="submit"
            :loading="submitting"
            label="Deploy"
          />
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
