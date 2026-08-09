<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import type { DeployAppCommand, DeployAppResponse } from '~/api/types.gen'

// useDeployApp / buildEnvRecord / extractApiError are Nuxt auto-imports
// (app/composables/*). Keeping them un-imported lets tests mock them via
// mockNuxtImport, matching the setup/github page convention.

useSeoMeta({ title: 'Deploy an app — Marsa' })

const { deploy } = useDeployApp()
const toast = useToast()

// Mirror the API contract (zDeployAppCommandWritable) so invalid input is caught
// inline before we ever hit the network. Env rows aren't schema-validated — they
// are collapsed into the `env` record by buildEnvRecord (blank keys dropped).
const schema = z.object({
  slug: z
    .string()
    .min(1, 'Required')
    .max(63, 'Max 63 characters')
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Lowercase letters, numbers and hyphens only'),
  image: z.string().min(1, 'Required'),
  containerPort: z
    .number({ message: 'Required' })
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 65535')
    .lte(65535, 'Must be between 1 and 65535'),
  minReplicas: z
    .number()
    .int('Must be a whole number')
    .gte(0, 'Must be between 0 and 100')
    .lte(100, 'Must be between 0 and 100')
    .optional(),
  maxReplicas: z
    .number()
    .int('Must be a whole number')
    .gte(1, 'Must be between 1 and 100')
    .lte(100, 'Must be between 1 and 100')
    .optional(),
})
type Schema = z.output<typeof schema>

const state = reactive<{
  slug: string
  image: string
  containerPort: number | undefined
  minReplicas: number | undefined
  maxReplicas: number | undefined
}>({
  slug: '',
  image: '',
  containerPort: undefined,
  minReplicas: undefined,
  maxReplicas: undefined,
})

// Stable per-row id so :key survives removals — index keys would shift and
// let v-model bind to the wrong row after a middle row is deleted.
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

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = null
  submitting.value = true

  let deployed: DeployAppResponse
  try {
    const env = buildEnvRecord(envRows.value)
    const command: DeployAppCommand = {
      slug: event.data.slug,
      image: event.data.image,
      containerPort: event.data.containerPort,
      ...(event.data.minReplicas !== undefined ? { minReplicas: event.data.minReplicas } : {}),
      ...(event.data.maxReplicas !== undefined ? { maxReplicas: event.data.maxReplicas } : {}),
      ...(Object.keys(env).length ? { env } : {}),
    }
    deployed = await deploy(command)
  } catch (err) {
    error.value = extractApiError(err)
    return
  } finally {
    submitting.value = false
  }

  // The rollout is what the operator wants to watch next, and it only exists on
  // the detail page — so confirmation has to be a toast that outlives this page.
  toast.add({
    title: 'Deploy started',
    description: `${deployed.appSlug} is rolling out at ${deployed.url}`,
    color: 'success',
    icon: 'i-lucide-check',
  })
  await navigateTo(`/apps/${deployed.appSlug}`)
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Deploy an app">
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

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
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

          <UFormField
            label="Container port"
            name="containerPort"
            description="Port the container listens on"
            required
          >
            <UInputNumber
              id="containerPort"
              v-model="state.containerPort"
              :min="1"
              :max="65535"
              placeholder="80"
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
